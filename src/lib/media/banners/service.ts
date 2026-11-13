import { randomBytes } from "node:crypto";
import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../config";
import { ApiError } from "../../errors";
import { convert, probe, type ProbeResult } from "../ffmpeg";
import { acquireJob, createWorkDir, waitForJob } from "../jobs";
import { downloadFromLink } from "../link-engine";
import { writeZip } from "../zip";
import { detectSegments, type DetectionResult, type Sensitivity } from "./detect";
import { extractClip, thumbnailArgs, type ClipMode } from "./extract";
import { scanFrames, type FrameScan } from "./frames";
import type { BannerExportView, BannerJobView } from "./types";

/**
 * Analyses de bannières : une analyse = un dossier temporaire contenant la vidéo source,
 * les vignettes et les séquences déjà extraites. Tout est supprimé après une période
 * d'inactivité ; rien n'est conservé durablement sur le serveur.
 */

type ExportState = BannerExportView & { file?: string };
type Job = {
  id: string;
  owner: string;
  dir: string;
  label: string;
  createdAt: number;
  touchedAt: number;
  status: BannerJobView["status"];
  progress: number;
  error?: { code: string; message: string };
  source?: string;
  info?: ProbeResult;
  scan?: FrameScan;
  sensitivity: Sensitivity;
  detection?: DetectionResult;
  clips: Map<string, Promise<{ path: string; mode: ClipMode }>>;
  thumbs: Map<string, Promise<string>>;
  exports: Map<string, ExportState>;
  busy: number;
  cleanup: () => Promise<void>;
};

type Store = { jobs: Map<string, Job>; timer?: NodeJS.Timeout; swept?: boolean };
const holder = globalThis as { __tokflowBanners?: Store };
const store: Store = (holder.__tokflowBanners ??= { jobs: new Map<string, Job>() });

const MAX_PER_OWNER = 3;
const MAX_ITEMS = 80;
const MAX_CLIPS = 120;

function sweep(now = Date.now()) {
  for (const job of store.jobs.values()) {
    if (job.busy === 0 && now - job.touchedAt > config.bannerTtlMs) void drop(job);
  }
}

/** Au démarrage : supprime les dossiers temporaires laissés par un arrêt brutal. */
async function sweepOrphans() {
  try {
    const root = tmpdir();
    for (const name of await readdir(root)) {
      if (!name.startsWith("tokflow-")) continue;
      const path = join(root, name);
      const info = await stat(path).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 3_600_000) await rm(path, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch {
    /* sans importance */
  }
}

function ensureSweeper() {
  if (!store.swept) {
    store.swept = true;
    void sweepOrphans();
  }
  if (!store.timer) {
    store.timer = setInterval(() => sweep(), 60_000);
    store.timer.unref();
  }
}

async function drop(job: Job) {
  store.jobs.delete(job.id);
  await job.cleanup();
}

/** Libère de la place : quota par visiteur, puis quota global (les plus anciennes inactives d'abord). */
async function makeRoom(owner: string) {
  const idle = (j: Job) => j.busy === 0;
  const oldest = (list: Job[]) => list.filter(idle).sort((a, b) => a.touchedAt - b.touchedAt)[0];
  const mine = [...store.jobs.values()].filter((j) => j.owner === owner);
  if (mine.length >= MAX_PER_OWNER) {
    const victim = oldest(mine);
    if (!victim) throw new ApiError("BUSY", "Vous avez déjà plusieurs analyses en cours. Attendez qu'elles se terminent.", { "Retry-After": "20" });
    await drop(victim);
  }
  if (store.jobs.size >= config.bannerMaxJobs) {
    const victim = oldest([...store.jobs.values()]);
    if (!victim) throw new ApiError("BUSY", undefined, { "Retry-After": "20" });
    await drop(victim);
  }
}

async function newJob(owner: string, label: string): Promise<Job> {
  ensureSweeper();
  await makeRoom(owner);
  const work = await createWorkDir();
  const job: Job = {
    id: randomBytes(16).toString("hex"),
    owner,
    dir: work.dir,
    label,
    createdAt: Date.now(),
    touchedAt: Date.now(),
    status: "downloading",
    progress: 0,
    sensitivity: "normal",
    clips: new Map(),
    thumbs: new Map(),
    exports: new Map(),
    busy: 0,
    cleanup: work.cleanup,
  };
  store.jobs.set(job.id, job);
  return job;
}

function fail(job: Job, err: unknown) {
  job.status = "error";
  job.error = err instanceof ApiError ? { code: err.code, message: err.message } : { code: "INTERNAL", message: "L'analyse a échoué de façon inattendue." };
  if (!(err instanceof ApiError)) console.error("[tokflow] analyse de bannières :", err);
}

function detect(job: Job) {
  job.detection = detectSegments(job.scan!.signatures, { times: job.scan!.times, duration: job.info?.durationSeconds ?? 0, sensitivity: job.sensitivity });
}

async function analyse(job: Job) {
  job.status = "analysing";
  job.progress = 0;
  const info = await probe(job.source!);
  if (!info.hasVideo) throw new ApiError("UNSUPPORTED_MEDIA", "Ce fichier ne contient pas de piste vidéo.");
  if (info.durationSeconds && info.durationSeconds > config.maxDurationSeconds) throw new ApiError("TOO_LONG");
  job.info = info;
  job.scan = await scanFrames(job.source!, info.durationSeconds, (ratio) => (job.progress = ratio));
  // Durée réelle de la piste vidéo (celle du conteneur peut inclure un son plus long).
  const times = job.scan.times;
  const step = times.length > 1 ? times[times.length - 1] / (times.length - 1) : 1 / 30;
  job.info = { ...info, durationSeconds: times[times.length - 1] + step };
  detect(job);
  job.progress = 1;
  job.status = "ready";
}

/** Lance la tâche de fond d'une analyse ; l'emplacement de traitement est rendu à la fin. */
function runInBackground(job: Job, release: () => void, work: () => Promise<void>) {
  job.busy++;
  void work()
    .catch((e) => fail(job, e))
    .finally(() => {
      job.busy--;
      job.touchedAt = Date.now();
      release();
    });
}

/** Analyse d'une vidéo publique à partir de son lien. */
export async function startFromLink(owner: string, url: string, linkId: string, quality: string): Promise<BannerJobView> {
  const release = acquireJob();
  let job: Job;
  try {
    job = await newJob(owner, `TokFlow-${linkId}`);
  } catch (e) {
    release();
    throw e;
  }
  runInBackground(job, release, async () => {
    job.source = await downloadFromLink(url, job.dir, quality);
    await analyse(job);
  });
  return view(job);
}

/** Analyse d'un fichier envoyé par l'utilisateur. `receive` écrit le fichier à l'emplacement donné. */
export async function startFromUpload(owner: string, label: string, receive: (path: string) => Promise<unknown>): Promise<BannerJobView> {
  const release = acquireJob();
  let job: Job;
  try {
    job = await newJob(owner, label || "TokFlow");
    job.source = join(job.dir, "source.bin");
    await receive(job.source);
  } catch (e) {
    release();
    if (job!) await drop(job);
    throw e;
  }
  runInBackground(job, release, () => analyse(job));
  return view(job);
}

export function getJob(id: string): Job {
  const job = /^[a-f0-9]{32}$/.test(id) ? store.jobs.get(id) : undefined;
  if (!job) throw new ApiError("EXPIRED");
  job.touchedAt = Date.now();
  return job;
}

function ready(job: Job): asserts job is Job & { source: string; info: ProbeResult; scan: FrameScan; detection: DetectionResult } {
  if (job.status !== "ready") throw new ApiError("CONFLICT", "L'analyse de cette vidéo n'est pas terminée.");
}

export function view(job: Job): BannerJobView {
  const exports = [...job.exports.values()];
  const last = exports[exports.length - 1];
  return {
    id: job.id,
    status: job.status,
    progress: Math.round(job.progress * 100) / 100,
    error: job.error,
    label: job.label,
    expiresAt: job.touchedAt + config.bannerTtlMs,
    sensitivity: job.sensitivity,
    duration: job.info?.durationSeconds,
    width: job.info?.width,
    height: job.info?.height,
    verdict: job.detection?.verdict,
    reason: job.detection?.reason,
    segments: job.detection?.segments ?? [],
    export: last ? { id: last.id, status: last.status, total: last.total, done: last.done, current: last.current, errors: last.errors, fileName: last.fileName, size: last.size } : undefined,
  };
}

export function setSensitivity(id: string, sensitivity: Sensitivity): BannerJobView {
  const job = getJob(id);
  ready(job);
  job.sensitivity = sensitivity;
  detect(job);
  return view(job);
}

export async function removeJob(id: string): Promise<void> {
  const job = getJob(id);
  if (job.busy === 0) await drop(job);
}

/** Vérifie un intervalle demandé par le client et le ramène dans la vidéo. */
export function checkRange(job: Job, startRaw: unknown, endRaw: unknown): { start: number; end: number } {
  ready(job);
  const start = Number(startRaw);
  const end = Number(endRaw);
  const duration = job.info.durationSeconds ?? 0;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration + 0.05 || end - start < 0.1) {
    throw new ApiError("INVALID_REQUEST", "Début ou fin de séquence invalide.");
  }
  return { start: Math.round(start * 1000) / 1000, end: Math.round(Math.min(end, duration) * 1000) / 1000 };
}

async function withSlot<T>(job: Job, work: () => Promise<T>): Promise<T> {
  job.busy++;
  try {
    const release = await waitForJob();
    try {
      return await work();
    } finally {
      release();
    }
  } finally {
    job.busy--;
    job.touchedAt = Date.now();
  }
}

/** Fichier vidéo d'une séquence (extrait une seule fois, puis réutilisé). */
export function clipFile(job: Job, start: number, end: number): Promise<{ path: string; mode: ClipMode }> {
  ready(job);
  const key = `${Math.round(start * 1000)}-${Math.round(end * 1000)}`;
  let pending = job.clips.get(key);
  if (!pending) {
    if (job.clips.size >= MAX_CLIPS) throw new ApiError("RATE_LIMITED", "Trop de découpes différentes pour cette vidéo. Relancez l'analyse.");
    const path = join(job.dir, `clip-${key}.mp4`);
    pending = withSlot(job, async () => ({ path, mode: await extractClip(job.source!, path, job.scan!, job.info!, start, end) }));
    job.clips.set(key, pending);
    pending.catch(() => job.clips.delete(key));
  }
  return pending;
}

/** Vignette JPEG d'un instant de la vidéo. */
export function thumbFile(job: Job, atRaw: unknown): Promise<string> {
  ready(job);
  const at = Number(atRaw);
  if (!Number.isFinite(at) || at < 0 || at > (job.info.durationSeconds ?? 0) + 0.05) throw new ApiError("INVALID_REQUEST", "Instant invalide.");
  const key = String(Math.round(at * 10));
  let pending = job.thumbs.get(key);
  if (!pending) {
    if (job.thumbs.size >= 400) throw new ApiError("RATE_LIMITED");
    const path = join(job.dir, `thumb-${key}.jpg`);
    pending = withSlot(job, async () => {
      await convert(thumbnailArgs(job.source!, path, Number(key) / 10), 30_000);
      return path;
    });
    job.thumbs.set(key, pending);
    pending.catch(() => job.thumbs.delete(key));
  }
  return pending;
}

export const bannerFileName = (index: number) => `Bannière ${String(index).padStart(2, "0")}.mp4`;

export type ExportItem = { index: number; start: number; end: number };

export function parseItems(job: Job, raw: unknown): ExportItem[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new ApiError("INVALID_REQUEST", "Aucune bannière sélectionnée.");
  if (raw.length > MAX_ITEMS) throw new ApiError("INVALID_REQUEST", `Sélection trop grande (maximum ${MAX_ITEMS} bannières).`);
  const seen = new Set<number>();
  return raw.map((item) => {
    const { index, start, end } = (item ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(index) || (index as number) < 1 || (index as number) > 999 || seen.has(index as number)) throw new ApiError("INVALID_REQUEST", "Numéro de bannière invalide.");
    seen.add(index as number);
    return { index: index as number, ...checkRange(job, start, end) };
  });
}

/** Prépare en tâche de fond une archive ZIP contenant uniquement les séquences demandées. */
export function startExport(id: string, rawItems: unknown): BannerJobView {
  const job = getJob(id);
  ready(job);
  const items = parseItems(job, rawItems);
  if ([...job.exports.values()].some((e) => e.status === "running")) throw new ApiError("CONFLICT", "Une archive est déjà en préparation pour cette vidéo.");
  // Une seule archive conservée à la fois.
  for (const old of job.exports.values()) if (old.file) void rm(old.file, { force: true }).catch(() => undefined);
  job.exports.clear();

  const exp: ExportState = { id: randomBytes(8).toString("hex"), status: "running", total: items.length, done: 0, errors: [], fileName: `${job.label}-bannieres.zip` };
  job.exports.set(exp.id, exp);
  job.busy++;
  void (async () => {
    const files: { name: string; path: string }[] = [];
    for (const item of items) {
      const name = bannerFileName(item.index);
      exp.current = name;
      try {
        files.push({ name, path: (await clipFile(job, item.start, item.end)).path });
      } catch (e) {
        exp.errors.push({ name, message: e instanceof ApiError ? e.message : "Extraction impossible." });
      }
      exp.done++;
      job.touchedAt = Date.now();
    }
    exp.current = undefined;
    if (!files.length) throw new ApiError("CONVERSION_FAILED", "Aucune bannière n'a pu être extraite.");
    const file = join(job.dir, `export-${exp.id}.zip`);
    exp.size = await writeZip(file, files);
    exp.file = file;
    exp.status = "ready";
  })()
    .catch((e) => {
      exp.status = "error";
      exp.errors.push({ name: "Archive", message: e instanceof ApiError ? e.message : "La création de l'archive a échoué." });
      if (!(e instanceof ApiError)) console.error("[tokflow] archive de bannières :", e);
    })
    .finally(() => {
      job.busy--;
      job.touchedAt = Date.now();
    });
  return view(job);
}

export function exportFile(id: string, exportId: string): { path: string; fileName: string } {
  const exp = getJob(id).exports.get(exportId);
  if (!exp || exp.status !== "ready" || !exp.file) throw new ApiError("EXPIRED", "Cette archive n'est plus disponible. Relancez le téléchargement.");
  return { path: exp.file, fileName: exp.fileName };
}

/** Pour les tests : vide le registre. */
export async function resetBannerJobs(): Promise<void> {
  await Promise.all([...store.jobs.values()].map(drop));
}

import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClipSource, type ClipSource } from "./clip-source";
import { BannerError } from "./errors";
import { fetchBytes } from "./http";
import { resolvePostLink } from "./link";
import { fetchPublicPost, type PublicImage, type PublicPost } from "./public-source";
import type { BannerSet, ClipStatus } from "./types";
import { buildZip } from "./zip";

const num = (name: string, fallback: number) => Number(process.env[name]) || fallback;
const TTL_MS = num("BANNER_TTL_MINUTES", 20) * 60_000;
const MAX_JOBS = num("BANNER_MAX_JOBS", 8);
const MAX_ITEMS = 40; // TikTok limite un carrousel à 35 éléments
const MAX_CLIP_BYTES = 30_000_000;
const MAX_IMAGE_BYTES = 25_000_000;
const MAX_JOB_CLIP_BYTES = 100_000_000; // total des clips d'une analyse
const MAX_ZIP_BYTES = 120_000_000; // l'archive est construite en mémoire (instance de 512 Mo)
const MEDIA_TIMEOUT_MS = num("BANNER_MEDIA_TIMEOUT_MS", 30000);
const MAX_ACTIVE = num("BANNER_MAX_ACTIVE", 3); // analyses simultanées

/** Les médias ne sont téléchargés que depuis les serveurs de fichiers de TikTok. */
const MEDIA_HOST = /(^|\.)(tiktokcdn(-[a-z0-9]+)?\.com|tiktokv\.com|ibyteimg\.com|byteimg\.com|muscdn\.com)$/;
// Tests automatisés uniquement, jamais en production : un faux serveur de médias local.
const TEST_MEDIA_HOST = process.env.NODE_ENV !== "production" && process.env.BANNER_TEST_LOCAL_MEDIA === "1" ? /^(127\.0\.0\.1|localhost)$/ : null;

type Stored = { path: string; bytes: number };
type Item = { n: number; width?: number; height?: number; imageUrls: string[]; clip: Stored | null; image: (Stored & { ext: ImageExt }) | null; pending?: Promise<void> };
type Job = { id: string; postId: string; author: string; title: string; dir: string; touchedAt: number; clipStatus: ClipStatus; items: Item[] };
type ImageExt = "jpg" | "webp" | "png";
export type BannerFile = { data: Buffer; name: string; type: string };

// État partagé par toutes les routes : Next.js peut charger ce module plusieurs fois.
type State = { jobs: Map<string, Job>; byPost: Map<string, string>; active: number; timer?: NodeJS.Timeout };
const g = globalThis as typeof globalThis & { __tokflowBanners?: State };
const state: State = (g.__tokflowBanners ??= { jobs: new Map(), byPost: new Map(), active: 0 });
if (!state.timer) {
  state.timer = setInterval(() => void sweep().catch(() => undefined), 60_000);
  state.timer.unref();
}

const pad = (n: number) => String(n).padStart(2, "0");
export const bannerFileName = (n: number, ext: string) => `Banniere_${pad(n)}.${ext}`;

/** Adresse de média acceptée : https, serveur de fichiers TikTok, port par défaut, sans identifiants. Sinon null. */
export function mediaUrl(raw: unknown): URL | null {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.username || url.password) return null;
  if (TEST_MEDIA_HOST?.test(host) && url.protocol === "http:") return url;
  if (url.protocol !== "https:" || url.port) return null;
  return MEDIA_HOST.test(host) ? url : null;
}

const isMp4 = (b: Buffer) => b.length > 12 && b.toString("latin1", 4, 8) === "ftyp";
function imageExt(b: Buffer): ImageExt | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (b.length > 8 && b.toString("latin1", 1, 4) === "PNG") return "png";
  return null;
}
const MIME = { mp4: "video/mp4", jpg: "image/jpeg", webp: "image/webp", png: "image/png" } as const;

/** Télécharge un média depuis l'une des adresses proposées ; la première qui fonctionne gagne. */
async function download(urls: string[], maxBytes: number, check: (b: Buffer) => boolean): Promise<Buffer | null> {
  for (const raw of urls.slice(0, 4)) {
    const url = mediaUrl(raw);
    if (!url) continue;
    try {
      // « manual » : une redirection n'est jamais suivie, même vers un domaine autorisé.
      const res = await fetchBytes(url, { timeoutMs: MEDIA_TIMEOUT_MS, maxBytes, redirect: "manual", headers: { referer: "https://www.tiktok.com/" } });
      if (res.status === 200 && check(res.body)) return res.body;
    } catch {
      /* adresse suivante */
    }
  }
  return null;
}

async function pool<T>(items: T[], size: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i], i);
      }
    }),
  );
}

async function drop(job: Job) {
  state.jobs.delete(job.id);
  if (state.byPost.get(job.postId) === job.id) state.byPost.delete(job.postId);
  await rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
}

/** Supprime les analyses expirées, puis les plus anciennes au-delà du plafond : les fichiers temporaires partent avec. */
async function sweep() {
  const now = Date.now();
  for (const job of [...state.jobs.values()]) if (now - job.touchedAt > TTL_MS) await drop(job);
  const sorted = [...state.jobs.values()].sort((a, b) => a.touchedAt - b.touchedAt);
  while (sorted.length >= MAX_JOBS) await drop(sorted.shift()!);
}

/** Supprime toutes les analyses et leurs fichiers temporaires (fin des tests). */
export async function resetBanners() {
  for (const job of [...state.jobs.values()]) await drop(job);
}

const NOTICES: Record<ClipStatus, string | undefined> = {
  ok: undefined,
  partial: "Certaines bannières n'ont pas d'animation accessible : elles sont proposées en image.",
  none: "Cette publication ne contient que des images fixes.",
  disabled: "La récupération des animations est désactivée : les bannières sont proposées en image.",
  unavailable: "Les animations n'ont pas pu être récupérées pour le moment : les bannières sont proposées en image. Réessayez plus tard pour obtenir les MP4.",
};

function view(job: Job): BannerSet {
  return {
    id: job.id,
    postId: job.postId,
    author: job.author,
    title: job.title,
    count: job.items.length,
    animatedCount: job.items.filter((i) => i.clip).length,
    clipStatus: job.clipStatus,
    notice: NOTICES[job.clipStatus],
    items: job.items.map((i) => ({ n: i.n, animated: Boolean(i.clip), width: i.width, height: i.height, clipBytes: i.clip?.bytes })),
  };
}

export type AnalyseOptions = { clipSource?: ClipSource | null; log?: (message: string) => void };

/**
 * Analyse un lien : images par la page publique de TikTok, clips par la source facultative.
 * Un échec de la source de clips n'empêche jamais de proposer les images.
 */
export async function analyseBanners(rawUrl: unknown, options: AnalyseOptions = {}): Promise<BannerSet> {
  if (state.active >= MAX_ACTIVE) throw new BannerError("BUSY", "Le service traite déjà plusieurs publications. Réessayez dans quelques secondes.", 503);
  state.active++;
  try {
    return await run(rawUrl, options);
  } finally {
    state.active--;
  }
}

let defaultSource: ClipSource | null | undefined;

async function run(rawUrl: unknown, { clipSource, log = () => undefined }: AnalyseOptions): Promise<BannerSet> {
  if (clipSource === undefined) clipSource = defaultSource ??= createClipSource();
  const link = await resolvePostLink(rawUrl);
  const known = state.jobs.get(state.byPost.get(link.id) ?? "");
  // Une analyse récente et complète est réutilisée ; une analyse sans animations est retentée.
  if (known && Date.now() - known.touchedAt < TTL_MS && known.clipStatus !== "unavailable") {
    known.touchedAt = Date.now();
    return view(known);
  }
  await sweep();

  // Lien « /photo/ » : les deux sources en parallèle. Lien « /video/ » : la page publique d'abord, afin de ne
  // jamais transmettre au service tiers l'adresse d'une vidéo classique (il n'est interrogé que pour un carrousel).
  const wantClips = () => (clipSource ? clipSource.fetchClips(link) : Promise.resolve(null));
  let pub: PromiseSettledResult<PublicPost>;
  let extra: PromiseSettledResult<Awaited<ReturnType<typeof wantClips>>>;
  if (link.kind === "photo") {
    [pub, extra] = await Promise.allSettled([fetchPublicPost(link), wantClips()]);
  } else {
    [pub] = await Promise.allSettled([fetchPublicPost(link)]);
    const skip = pub.status === "fulfilled" ? pub.value.images.length === 0 : pub.reason instanceof BannerError && pub.reason.code === "POST_UNAVAILABLE";
    [extra] = await Promise.allSettled([skip ? Promise.resolve(null) : wantClips()]);
  }
  const code = (reason: unknown) => (reason instanceof BannerError ? reason.code : String(reason));
  if (extra.status === "rejected") log(`source de clips (${clipSource?.name}) : ${code(extra.reason)}`);
  if (pub.status === "rejected") log(`page publique : ${code(pub.reason)}`);
  const clipData = extra.status === "fulfilled" ? extra.value : null;

  // Images : la page publique d'abord ; à défaut, celles que la source de clips connaît.
  let images: PublicImage[];
  let meta = { author: link.username, title: "" };
  if (pub.status === "fulfilled") {
    meta = pub.value;
    images = pub.value.images;
  } else if (code(pub.reason) === "POST_UNAVAILABLE" || !clipData?.images.length) {
    throw pub.reason;
  } else {
    images = clipData.images.map((urls) => ({ urls }));
  }
  if (!images.length) throw new BannerError("NOT_A_CAROUSEL", "Cette publication est une vidéo classique, pas un carrousel de bannières.");
  if (images.length > MAX_ITEMS) throw new BannerError("TOO_MANY", "Cette publication contient trop d'éléments.");

  const dir = await mkdtemp(join(tmpdir(), "tokflow-bannieres-"));
  const job: Job = { id: randomBytes(16).toString("hex"), postId: link.id, author: meta.author, title: meta.title, dir, touchedAt: Date.now(), clipStatus: "ok", items: [] };
  job.items = images.map((image, i) => ({ n: i + 1, width: image.width, height: image.height, imageUrls: image.urls, clip: null, image: null }));

  // Les clips ne sont associés aux images que si leur nombre concorde exactement : pas de devinette.
  const clips = clipData?.clips ?? [];
  const aligned = clips.length === images.length;
  if (clipData && clips.length && !aligned) log(`clips ignorés : ${clips.length} clips pour ${images.length} images`);
  let clipBudget = MAX_JOB_CLIP_BYTES;
  let failed = 0;
  if (aligned) {
    // Téléchargés tout de suite : leurs adresses expirent, et l'aperçu doit être immédiat.
    await pool(job.items, 4, async (item, i) => {
      const clip = clips[i];
      if (!clip) return;
      const data = clipBudget > 0 ? await download([clip], Math.min(MAX_CLIP_BYTES, clipBudget), isMp4) : null;
      if (!data) {
        failed++;
        return log(`clip ${item.n} : téléchargement impossible`);
      }
      clipBudget -= data.length;
      const path = join(dir, `${pad(item.n)}.mp4`);
      await writeFile(path, data);
      item.clip = { path, bytes: data.length };
    });
  }
  const animated = job.items.filter((i) => i.clip).length;
  if (!clipSource) job.clipStatus = "disabled";
  else if (!clipData || (clips.length && !aligned)) job.clipStatus = "unavailable";
  else if (!clips.some(Boolean)) job.clipStatus = "none";
  else if (animated === 0) job.clipStatus = "unavailable";
  else job.clipStatus = animated === job.items.length ? "ok" : "partial";
  if (failed) log(`${failed} clip(s) non récupéré(s)`);

  if (known) await drop(known);
  state.jobs.set(job.id, job);
  state.byPost.set(job.postId, job.id);
  return view(job);
}

function getJob(id: string): Job {
  const job = /^[a-f0-9]{32}$/.test(String(id)) ? state.jobs.get(id) : undefined;
  if (!job || Date.now() - job.touchedAt > TTL_MS) throw new BannerError("EXPIRED", "Cette analyse a expiré. Relancez-la à partir du lien.", 410);
  job.touchedAt = Date.now();
  return job;
}

function getItem(job: Job, n: unknown): Item {
  const item = typeof n === "number" && Number.isInteger(n) ? job.items[n - 1] : undefined;
  if (!item) throw new BannerError("NOT_FOUND", "Bannière inconnue.", 404);
  return item;
}

/** Fichier d'une bannière, tel que TikTok le fournit (aucun réencodage, aucun recadrage). */
export async function getBannerFile(jobId: string, n: number, format: string): Promise<BannerFile> {
  const job = getJob(jobId);
  const item = getItem(job, n);
  if (format === "mp4") {
    if (!item.clip) throw new BannerError("NO_ANIMATION", "Cette bannière n'existe qu'en image fixe.", 404);
    return { data: await readFile(item.clip.path), name: bannerFileName(n, "mp4"), type: MIME.mp4 };
  }
  if (format !== "jpg") throw new BannerError("BAD_FORMAT", "Format inconnu.");
  if (!item.image) {
    // Une seule tentative à la fois par image, même si plusieurs demandes arrivent ensemble.
    item.pending ??= (async () => {
      const data = await download(item.imageUrls, MAX_IMAGE_BYTES, (b) => imageExt(b) !== null);
      if (!data) throw new BannerError("IMAGE_UNAVAILABLE", "TikTok ne fournit plus cette image. Relancez l'analyse à partir du lien.", 502);
      const ext = imageExt(data)!;
      const path = join(job.dir, `${pad(n)}.${ext}`);
      await writeFile(path, data);
      item.image = { path, ext, bytes: data.length };
    })().finally(() => {
      item.pending = undefined;
    });
    await item.pending;
  }
  const image = item.image!;
  return { data: await readFile(image.path), name: bannerFileName(n, image.ext), type: MIME[image.ext] };
}

/**
 * Archive contenant exactement les bannières demandées.
 * selection : [{ n, formats? }] ; sans `formats`, le MP4 s'il existe, sinon l'image.
 */
export async function getBannerZip(jobId: string, selection: unknown): Promise<{ data: Buffer; name: string; files: string[] }> {
  const job = getJob(jobId);
  if (!Array.isArray(selection) || !selection.length) throw new BannerError("EMPTY", "Aucune bannière sélectionnée.");
  if (selection.length > MAX_ITEMS) throw new BannerError("TOO_MANY", "Sélection trop grande.");
  const wanted: { n: number; format: string }[] = [];
  const seen = new Set<string>();
  for (const entry of selection as { n?: unknown; formats?: unknown }[]) {
    const item = getItem(job, entry?.n);
    const formats: unknown[] = Array.isArray(entry.formats) && entry.formats.length ? entry.formats : [item.clip ? "mp4" : "jpg"];
    for (const format of formats) {
      if (format !== "mp4" && format !== "jpg") throw new BannerError("BAD_FORMAT", "Format inconnu.");
      if (format === "mp4" && !item.clip) continue; // image fixe : pas de MP4 inventé
      if (!seen.has(`${item.n}.${format}`)) wanted.push({ n: item.n, format });
      seen.add(`${item.n}.${format}`);
    }
  }
  if (!wanted.length) throw new BannerError("EMPTY", "Aucun fichier disponible pour cette sélection.");
  wanted.sort((a, b) => a.n - b.n || a.format.localeCompare(b.format));
  const files: { name: string; data: Buffer }[] = new Array(wanted.length);
  let total = 0;
  await pool(wanted, 4, async (w, i) => {
    const file = await getBannerFile(jobId, w.n, w.format);
    total += file.data.length;
    if (total > MAX_ZIP_BYTES) throw new BannerError("ZIP_TOO_LARGE", "Cette sélection est trop volumineuse pour une seule archive. Réduisez-la.", 413);
    files[i] = { name: file.name, data: file.data };
  });
  return { data: buildZip(files), name: `Bannieres_${job.author.replace(/[^A-Za-z0-9._-]/g, "") || "TikTok"}_${job.postId}.zip`, files: files.map((f) => f.name) };
}

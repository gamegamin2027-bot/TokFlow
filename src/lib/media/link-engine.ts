import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config";
import { ApiError } from "../errors";

/**
 * Moteur de récupération des vidéos publiques par lien (yt-dlp).
 * Aucune authentification ni cookie n'est transmis : seuls les contenus
 * consultables publiquement sont accessibles. Voir README.
 */
export type LinkQuality = { id: string; label: string; codec: string; sizeBytes?: number };
export type LinkMetadata = {
  /** Vrai si TikTok ne propose publiquement qu'une version avec filigrane incrusté. */
  watermarkedOnly: boolean;
  title?: string;
  authorName?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  qualities: LinkQuality[];
};

type YtFormat = { format_id?: string; width?: number; height?: number; vcodec?: string; acodec?: string; filesize?: number; tbr?: number; format_note?: string };

function exec(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(config.ytdlpPath, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, killSignal: "SIGKILL" }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve(stdout);
    });
  });
}

const AMBIGUOUS_REFUSAL = /your ip address is blocked|not available in your (country|region)|geo.?restrict/i;

/** Dernière ligne d'erreur du moteur, pour le diagnostic (aucune donnée personnelle). */
function engineDetail(stderr: string): string | undefined {
  const line = stderr.split("\n").map((l) => l.trim()).filter(Boolean).reverse().find((l) => /^ERROR|Error/.test(l)) ?? stderr.trim().split("\n").pop();
  return line ? line.replace(/^ERROR:\s*/, "").slice(0, 220) : undefined;
}

/** Traduit une erreur du moteur en erreur lisible, sans jamais la masquer en succès. */
export function classifyEngineError(stderr: string): ApiError {
  const withDetail = (e: ApiError) => Object.assign(e, { detail: engineDetail(stderr) });
  if (/Requested format/i.test(stderr)) return withDetail(new ApiError("NOT_FOUND", "Cette qualité n'est plus proposée par TikTok. Relancez la récupération du lien."));
  if (/private|friends only|followers only|log ?in (is )?required|login required|requires? (login|authentication)|age.?restrict|sign in/i.test(stderr)) return withDetail(new ApiError("VIDEO_PRIVATE"));
  if (/status_?code[^0-9]{0,4}10204|video (is )?not available|currently unavailable|has been removed|been deleted|does not exist|HTTP Error 404|removed by/i.test(stderr)) return withDetail(new ApiError("VIDEO_DELETED"));
  // TikTok renvoie le même refus (code 10204) pour une vidéo supprimée et pour un serveur bloqué :
  // fetchLinkMetadata lève l'ambiguïté avec une vidéo témoin.
  if (AMBIGUOUS_REFUSAL.test(stderr)) {
    return withDetail(new ApiError("UPSTREAM_ERROR", "TikTok bloque l'accès à cette vidéo depuis notre serveur (restriction régionale ou adresse refusée). Elle existe peut-être, mais nous ne pouvons pas la récupérer."));
  }
  if (/403|forbidden|captcha|429|too many requests|unable to extract|impersonat|unexpected response|timed out|connection|temporar|5\d\d/i.test(stderr)) {
    return withDetail(new ApiError("UPSTREAM_ERROR", "TikTok ne répond pas correctement à notre serveur pour le moment. Réessayez dans quelques minutes."));
  }
  return withDetail(new ApiError("UPSTREAM_ERROR", "La vidéo n'a pas pu être récupérée pour le moment. Réessayez dans quelques minutes."));
}

function mapError(err: unknown): ApiError {
  const e = err as { killed?: boolean; code?: string; stderr?: string };
  if (e.code === "ENOENT") return new ApiError("LINK_DOWNLOAD_DISABLED", "Le moteur de récupération n'est pas installé sur le serveur.");
  if (e.killed) return new ApiError("TIMEOUT", "TikTok a mis trop de temps à répondre. Réessayez dans un instant.");
  const msg = e.stderr ?? "";
  console.error("[tokflow] link engine:", msg.slice(-400));
  return classifyEngineError(msg);
}

/**
 * TikTok sert deux familles de fichiers : le flux de lecture d'origine (image
 * propre) et une variante d'export où le logo et le nom du compte sont
 * incrustés. TokFlow ne retient que la première et n'altère jamais l'image.
 */
export function isWatermarked(f: YtFormat): boolean {
  return !!f.format_id?.startsWith("download") || /watermark/i.test(f.format_note ?? "");
}

const isVideo = (f: YtFormat) => !!f.format_id && !!f.width && !!f.height && !!f.vcodec && f.vcodec !== "none";

/** Regroupe les formats sans filigrane par définition, en privilégiant le H.264 (compatibilité maximale). */
export function buildQualities(formats: YtFormat[]): LinkQuality[] {
  const byLabel = new Map<number, YtFormat>();
  for (const f of formats) {
    if (!isVideo(f) || isWatermarked(f)) continue;
    if (!/^[\w.-]{1,80}$/.test(f.format_id!)) continue;
    const side = Math.min(f.width!, f.height!);
    const current = byLabel.get(side);
    const score = (x: YtFormat) => (x.vcodec?.startsWith("h264") || x.vcodec?.startsWith("avc") ? 1e9 : 0) + (x.tbr ?? x.filesize ?? 0);
    if (!current || score(f) > score(current)) byLabel.set(side, f);
  }
  return [...byLabel.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([side, f]) => ({
      id: f.format_id!,
      label: f.format_id!.match(/_(\d{3,4}p)_/)?.[1] ?? `${side}p`,
      codec: f.vcodec!.startsWith("h264") || f.vcodec!.startsWith("avc") ? "H.264" : "HEVC",
      sizeBytes: f.filesize,
    }));
}

let versionCache: Promise<string | null> | undefined;
/** Version du moteur installé, ou null s'il est absent (diagnostic du health check). */
export function linkEngineVersion(): Promise<string | null> {
  versionCache ??= exec(["--version"], 10_000).then((v) => v.trim(), () => null);
  return versionCache;
}

/** Vidéo publique ancienne et stable, utilisée uniquement pour vérifier que TikTok répond à ce serveur. */
const CANARY_URL = process.env.TOKFLOW_CANARY_URL || "https://www.tiktok.com/@scout2015/video/6718335390845095173";
let canary: { ok: boolean; at: number } | undefined;

async function serverCanReachTikTok(requestedUrl: string): Promise<boolean> {
  if (requestedUrl === CANARY_URL) return false;
  if (canary && Date.now() - canary.at < 10 * 60_000) return canary.ok;
  let ok = false;
  try {
    await exec(["--simulate", "--no-playlist", "--no-warnings", "--socket-timeout", "10", CANARY_URL], 25_000);
    ok = true;
  } catch {
    /* le serveur est refusé par TikTok, ou TikTok est en panne */
  }
  canary = { ok, at: Date.now() };
  console.error(`[tokflow] vidéo témoin : ${ok ? "accessible" : "inaccessible (serveur refusé par TikTok ?)"}`);
  return ok;
}

export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  let out: string;
  try {
    out = await exec(["-J", "--no-playlist", "--no-warnings", "--socket-timeout", "10", url], 30_000);
  } catch (e) {
    const mapped = mapError(e);
    // Refus ambigu : si la vidéo témoin, elle, répond, notre serveur n'est pas bloqué
    // et c'est donc bien cette vidéo qui n'existe plus.
    if (AMBIGUOUS_REFUSAL.test((e as { stderr?: string }).stderr ?? "") && (await serverCanReachTikTok(url))) {
      throw Object.assign(new ApiError("VIDEO_DELETED"), { detail: (mapped as { detail?: string }).detail });
    }
    throw mapped;
  }
  const d = JSON.parse(out) as { title?: string; uploader?: string; channel?: string; duration?: number; thumbnail?: string; formats?: YtFormat[] };
  const formats = d.formats ?? [];
  const qualities = buildQualities(formats);
  return {
    title: d.title,
    authorName: d.channel || d.uploader,
    durationSeconds: d.duration,
    thumbnailUrl: d.thumbnail,
    qualities,
    watermarkedOnly: qualities.length === 0 && formats.some((f) => isVideo(f) && isWatermarked(f)),
  };
}

/**
 * Télécharge le format demandé. L'identifiant provient de la liste renvoyée par
 * l'analyse, qui ne contient que des flux sans filigrane ; la variante d'export
 * avec filigrane est refusée explicitement.
 */
export async function downloadFromLink(url: string, dir: string, formatId: string): Promise<string> {
  if (!/^[\w.-]{1,80}$/.test(formatId) || formatId.startsWith("download")) throw new ApiError("INVALID_REQUEST", "Qualité inconnue.");
  try {
    await exec(
      ["--no-playlist", "--no-warnings", "--no-part", "--socket-timeout", "10", "--max-filesize", String(config.maxUploadBytes), "-f", formatId, "-o", join(dir, "source.%(ext)s"), url],
      config.jobTimeoutMs,
    );
  } catch (e) {
    throw mapError(e);
  }
  const file = (await readdir(dir)).find((f) => f.startsWith("source."));
  if (!file) throw new ApiError("UPSTREAM_ERROR");
  return join(dir, file);
}

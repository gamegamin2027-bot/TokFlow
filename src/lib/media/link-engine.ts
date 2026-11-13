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

function mapError(err: unknown): ApiError {
  const e = err as { killed?: boolean; code?: string; stderr?: string };
  if (e.code === "ENOENT") return new ApiError("LINK_DOWNLOAD_DISABLED", "Le moteur de récupération n'est pas installé sur le serveur.");
  if (e.killed) return new ApiError("TIMEOUT");
  const msg = e.stderr ?? "";
  if (/Requested format/i.test(msg)) return new ApiError("NOT_FOUND", "Cette qualité n'est plus proposée par TikTok. Relancez l'analyse du lien.");
  if (/private|not available|unavailable|removed|404|log in|login|blocked|restricted/i.test(msg)) return new ApiError("NOT_FOUND");
  console.error("[tokflow] link engine:", msg.slice(-400));
  if (/403|forbidden|captcha|429|too many requests|unable to extract|impersonat/i.test(msg)) {
    return new ApiError("UPSTREAM_ERROR", "TikTok a refusé la requête envoyée depuis ce serveur (accès automatisé limité). Réessayez plus tard.");
  }
  return new ApiError("UPSTREAM_ERROR");
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

export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  let out: string;
  try {
    out = await exec(["-J", "--no-playlist", "--no-warnings", "--socket-timeout", "10", url], 30_000);
  } catch (e) {
    throw mapError(e);
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

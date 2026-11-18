import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
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

/** Mode réseau du moteur : proxy configuré, relais Tor embarqué, ou connexion directe. */
export const networkMode = (): "proxy" | "tor" | "direct" => (config.proxyUrl ? "proxy" : config.torPort ? "tor" : "direct");

/**
 * Arguments réseau communs. Avec Tor, chaque appel utilise un identifiant SOCKS aléatoire :
 * Tor ouvre alors un circuit distinct, donc une nouvelle adresse de sortie à chaque tentative.
 */
export function networkArgs(proxyUrl: string | null = config.proxyUrl, torPort: number = config.torPort): string[] {
  if (proxyUrl) return ["--proxy", proxyUrl];
  if (torPort) return ["--proxy", `socks5h://c${randomBytes(6).toString("hex")}:x@127.0.0.1:${torPort}`];
  return [];
}

/** Retire l'adresse du proxy (et ses identifiants) de tout texte journalisé ou renvoyé. */
export function redactProxy(text: string, proxyUrl: string | null = config.proxyUrl): string {
  let out = proxyUrl ? text.split(proxyUrl).join("[proxy]") : text;
  out = out.replace(/\b((?:https?|socks5h?):\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1***@");
  return out;
}

function execOnce(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(config.ytdlpPath, [...networkArgs(), ...args], { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, killSignal: "SIGKILL" }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: redactProxy(String(stderr)) }));
      else resolve(stdout);
    });
  });
}

const AMBIGUOUS_REFUSAL = /your ip address is blocked|not available in your (country|region)|geo.?restrict/i;

/** Erreurs définitives : inutile de réessayer par un autre circuit. */
const FINAL_ERROR = /private|Requested format|File is larger than max-filesize/i;

/** Par Tor, une sortie peut être refusée ou coupée : on réessaie par un autre circuit. */
async function exec(args: string[], timeoutMs: number): Promise<string> {
  const attempts = networkMode() === "tor" ? 3 : 1;
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    const left = deadline - Date.now();
    if (left < 3000) break;
    try {
      return await execOnce(args, Math.min(left, Math.ceil(timeoutMs / (attempts > 1 ? 2 : 1))));
    } catch (e) {
      last = e;
      if (FINAL_ERROR.test((e as { stderr?: string }).stderr ?? "")) break;
      if (i < attempts) console.error(`[tokflow] tentative ${i}/${attempts} échouée, nouveau circuit`);
    }
  }
  throw last;
}

/** Traduit une erreur du moteur en erreur lisible, sans jamais la masquer en succès. */
export function classifyEngineError(stderr: string): ApiError {
  if (/Requested format/i.test(stderr)) return new ApiError("NOT_FOUND", "Cette qualité n'est plus proposée par TikTok. Relancez la récupération du lien.");
  if (/private|friends only|followers only|log ?in (is )?required|login required|requires? (login|authentication)|age.?restrict|sign in/i.test(stderr)) return new ApiError("VIDEO_PRIVATE");
  if (/status_?code[^0-9]{0,4}10204|video (is )?not available|currently unavailable|has been removed|been deleted|does not exist|HTTP Error 404|removed by/i.test(stderr)) return new ApiError("VIDEO_DELETED");
  // TikTok renvoie le même refus (code 10204) pour une vidéo supprimée et pour un serveur bloqué :
  // fetchLinkMetadata lève l'ambiguïté avec une vidéo témoin.
  if (AMBIGUOUS_REFUSAL.test(stderr)) {
    return new ApiError("UPSTREAM_ERROR", "TikTok bloque l'accès à cette vidéo depuis notre serveur (restriction régionale ou adresse refusée). Elle existe peut-être, mais nous ne pouvons pas la récupérer.");
  }
  if (/proxy/i.test(stderr)) return new ApiError("UPSTREAM_ERROR", "Le relais réseau du serveur ne répond pas. Réessayez dans quelques minutes.");
  if (/403|forbidden|captcha|429|too many requests|unable to extract|impersonat|unexpected response|timed out|connection|temporar|5\d\d/i.test(stderr)) {
    return new ApiError("UPSTREAM_ERROR", "TikTok ne répond pas correctement à notre serveur pour le moment. Réessayez dans quelques minutes.");
  }
  return new ApiError("UPSTREAM_ERROR", "La vidéo n'a pas pu être récupérée pour le moment. Réessayez dans quelques minutes.");
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

/**
 * Informations du moteur conservées quelques minutes après la récupération d'un lien :
 * le téléchargement qui suit les réutilise au lieu d'interroger TikTok une seconde fois.
 */
const INFO_TTL_MS = 4 * 60_000;
const infoCache = new Map<string, { json: string; at: number }>();
function rememberInfo(url: string, json: string) {
  if (json.length > 2_000_000) return;
  infoCache.delete(url);
  infoCache.set(url, { json, at: Date.now() });
  for (const [key, v] of infoCache) {
    if (infoCache.size <= 40 && Date.now() - v.at < INFO_TTL_MS) break;
    infoCache.delete(key);
  }
}
function recallInfo(url: string): string | undefined {
  const hit = infoCache.get(url);
  if (hit && Date.now() - hit.at < INFO_TTL_MS) return hit.json;
  infoCache.delete(url);
}

/** Transforme la sortie JSON du moteur en informations utilisables par l'interface. */
function readInfo(json: string): LinkMetadata {
  const d = JSON.parse(json) as { title?: string; uploader?: string; channel?: string; duration?: number; thumbnail?: string; formats?: YtFormat[] };
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

export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  // Second passage sur le même lien (rafraîchissement, seconde tentative) : la réponse est déjà connue.
  const cached = recallInfo(url);
  if (cached) {
    try {
      return readInfo(cached);
    } catch {
      infoCache.delete(url);
    }
  }
  let out: string;
  try {
    out = await exec(["-J", "--no-playlist", "--no-warnings", "--socket-timeout", "10", url], networkMode() === "tor" ? 60_000 : 30_000);
  } catch (e) {
    const mapped = mapError(e);
    // Refus ambigu : si la vidéo témoin, elle, répond, notre serveur n'est pas bloqué
    // et c'est donc bien cette vidéo qui n'existe plus.
    if (AMBIGUOUS_REFUSAL.test((e as { stderr?: string }).stderr ?? "") && (await serverCanReachTikTok(url))) {
      throw Object.assign(new ApiError("VIDEO_DELETED"), { detail: (mapped as { detail?: string }).detail });
    }
    throw mapped;
  }
  rememberInfo(url, out);
  return readInfo(out);
}

/**
 * Lecture dans la page : les adresses de flux de TikTok ne s'ouvrent que pour TikTok
 * (le CDN répond 403 à tout autre lecteur), la vidéo est donc relayée par le serveur.
 * Le flux démarre dès les premiers octets reçus : l'utilisateur voit l'image sans attendre
 * la fin du fichier, et rien n'est écrit sur le disque.
 */
export async function previewStream(url: string, formatId: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  if (!/^[\w.-]{1,80}$/.test(formatId) || formatId.startsWith("download")) throw new ApiError("INVALID_REQUEST", "Qualité inconnue.");
  const child = spawn(
    config.ytdlpPath,
    [...networkArgs(), "--no-playlist", "--no-warnings", "--no-part", "--socket-timeout", "10", "-f", formatId, "-o", "-", url],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    if (stderr.length < 8000) stderr += String(chunk);
  });
  const stop = () => {
    if (!child.killed) child.kill("SIGKILL");
  };
  signal.addEventListener("abort", stop, { once: true });
  child.on("close", () => signal.removeEventListener("abort", stop));

  const stdout = child.stdout!;
  // On attend le premier octet : une erreur du moteur devient une vraie erreur HTTP,
  // au lieu d'un lecteur qui tourne dans le vide.
  const first = await new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new ApiError("TIMEOUT", "La vidéo met trop de temps à démarrer. Réessayez dans un instant."));
    }, 20_000);
    const settle = (fn: () => void) => {
      clearTimeout(timer);
      stdout.off("data", onData);
      child.off("error", onError);
      child.off("close", onClose);
      fn();
    };
    const onData = (chunk: Buffer) => settle(() => { stdout.pause(); resolve(chunk); });
    const onError = (e: NodeJS.ErrnoException) =>
      settle(() => reject(e.code === "ENOENT" ? new ApiError("LINK_DOWNLOAD_DISABLED", "Le moteur de récupération n'est pas installé sur le serveur.") : new ApiError("UPSTREAM_ERROR")));
    const onClose = () => settle(() => reject(classifyEngineError(stderr)));
    stdout.on("data", onData);
    child.on("error", onError);
    child.on("close", onClose);
  }).catch((e) => {
    signal.removeEventListener("abort", stop);
    throw e;
  });

  const body = Readable.from(
    (async function* () {
      try {
        yield first;
        for await (const chunk of stdout) yield chunk as Buffer;
      } finally {
        stop();
      }
    })(),
  );
  return Readable.toWeb(body) as ReadableStream<Uint8Array>;
}

/**
 * Télécharge la piste audio seule (bien plus légère que la vidéo), avec repli sur le
 * plus petit fichier complet. La conversion en MP3 qui suit est ainsi plus rapide et
 * moins exposée aux pistes audio abîmées.
 */
export async function downloadAudioFromLink(url: string, dir: string): Promise<string> {
  const common = ["--no-playlist", "--no-warnings", "--no-part", "--socket-timeout", "10", "--max-filesize", String(config.maxUploadBytes), "-o", join(dir, "audio.%(ext)s")];
  const findAudio = async () => {
    const file = (await readdir(dir)).find((f) => f.startsWith("audio."));
    return file ? join(dir, file) : null;
  };
  // Chemin rapide : les adresses de flux de l'analyse sont encore valides.
  const cached = recallInfo(url);
  if (cached) {
    try {
      const infoFile = join(dir, "info.json");
      await writeFile(infoFile, cached);
      await execOnce([...common, "-f", "ba", "--load-info-json", infoFile], config.jobTimeoutMs);
      const file = await findAudio();
      if (file) return file;
    } catch {
      infoCache.delete(url);
    }
  }
  let lastError: unknown;
  for (const selector of ["ba", "worst"]) {
    try {
      await exec([...common, "-f", selector, url], config.jobTimeoutMs);
    } catch (e) {
      lastError = e;
      continue;
    }
    const file = await findAudio();
    if (file) return file;
  }
  throw mapError(lastError);
}

/**
 * Télécharge le format demandé. L'identifiant provient de la liste renvoyée par
 * l'analyse, qui ne contient que des flux sans filigrane ; la variante d'export
 * avec filigrane est refusée explicitement.
 */
export async function downloadFromLink(url: string, dir: string, formatId: string): Promise<string> {
  if (!/^[\w.-]{1,80}$/.test(formatId) || formatId.startsWith("download")) throw new ApiError("INVALID_REQUEST", "Qualité inconnue.");
  const common = ["--no-playlist", "--no-warnings", "--no-part", "--socket-timeout", "10", "--max-filesize", String(config.maxUploadBytes), "-f", formatId, "-o", join(dir, "source.%(ext)s")];
  const cached = recallInfo(url);
  let done = false;
  if (cached) {
    // Chemin rapide : les adresses de flux obtenues à la récupération sont encore valides.
    try {
      const infoFile = join(dir, "info.json");
      await writeFile(infoFile, cached);
      await execOnce([...common, "--load-info-json", infoFile], config.jobTimeoutMs);
      done = true;
    } catch (e) {
      infoCache.delete(url);
      console.error("[tokflow] informations en cache refusées, nouvelle récupération :", String((e as { stderr?: string }).stderr ?? "").slice(-200));
    }
  }
  if (!done) {
    try {
      await exec([...common, url], config.jobTimeoutMs);
    } catch (e) {
      throw mapError(e);
    }
  }
  const file = (await readdir(dir)).find((f) => f.startsWith("source."));
  if (!file) throw new ApiError("UPSTREAM_ERROR");
  return join(dir, file);
}

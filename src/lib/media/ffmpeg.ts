import { spawn } from "node:child_process";
import { config } from "../config";
import { ApiError } from "../errors";
import type { Mp3Bitrate, Mp4Target } from "./formats";

export type ProbeResult = { durationSeconds?: number; hasVideo: boolean; hasAudio: boolean; width?: number; height?: number };

function run(bin: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stderr: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-8000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, timedOut });
    });
  });
}

export function parseProbe(stderr: string): ProbeResult {
  const dur = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const video = stderr.match(/Stream #.*Video:.*?[ ,](\d{2,5})x(\d{2,5})/);
  return {
    durationSeconds: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : undefined,
    hasVideo: /Stream #.*Video:/.test(stderr) && !/Video: (mjpeg|png)/.test(stderr.match(/Stream #.*Video:.*/)?.[0] ?? ""),
    hasAudio: /Stream #.*Audio:/.test(stderr),
    width: video ? Number(video[1]) : undefined,
    height: video ? Number(video[2]) : undefined,
  };
}

/** Inspecte un fichier local avec `ffmpeg -i` (pas besoin de ffprobe). */
export async function probe(file: string): Promise<ProbeResult> {
  const { stderr } = await run(config.ffmpegPath, ["-hide_banner", "-i", file], 20_000);
  if (!/Input #0/.test(stderr)) throw new ApiError("UNSUPPORTED_MEDIA");
  return parseProbe(stderr);
}

/**
 * Piste audio vers MP3. `-ac 2` et le rééchantillonneur explicite évitent l'échec
 * « Failed to configure output pad on auto_aresample » : certaines vidéos TikTok ont
 * une piste dont le format de canaux change en cours de lecture (mono puis stéréo,
 * multicanal, débit variable). Sans ces réglages, ffmpeg abandonnait en plein milieu.
 */
export function mp3Args(input: string, output: string, bitrate: Mp3Bitrate): string[] {
  return [
    "-hide_banner", "-nostdin", "-y",
    // Une image audio abîmée ne doit pas faire échouer tout le fichier : on l'ignore.
    "-err_detect", "ignore_err", "-fflags", "+discardcorrupt",
    "-i", input,
    "-vn", "-map", "0:a:0",
    "-af", "aresample=async=1:min_hard_comp=0.1:first_pts=0",
    "-ac", "2", "-ar", "44100",
    "-c:a", "libmp3lame", "-b:a", `${bitrate}k`,
    "-map_metadata", "-1", "-f", "mp3", output,
  ];
}

/** Étape intermédiaire de secours : la piste audio est d'abord ramenée en WAV brut. */
export function wavArgs(input: string, output: string): string[] {
  return ["-hide_banner", "-nostdin", "-y", "-err_detect", "ignore_err", "-fflags", "+discardcorrupt", "-i", input, "-vn", "-map", "0:a:0", "-af", "aresample=async=1:first_pts=0", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", "-map_metadata", "-1", "-f", "wav", output];
}

export function mp4Args(input: string, output: string, target: Mp4Target): string[] {
  const base = ["-hide_banner", "-nostdin", "-y", "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1"];
  if (target === "source") {
    return [...base, "-c", "copy", "-movflags", "+faststart", "-f", "mp4", output];
  }
  // Redimensionne le petit côté vers la cible, sans jamais agrandir, dimensions paires.
  const scale = `scale='if(gt(iw,ih),-2,min(${target},iw))':'if(gt(iw,ih),min(${target},ih),-2)'`;
  return [...base, "-vf", scale, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-threads", "2", "-f", "mp4", output];
}

export async function convert(args: string[]): Promise<void> {
  let result;
  try {
    result = await run(config.ffmpegPath, args, config.jobTimeoutMs);
  } catch (e) {
    console.error("[tokflow] ffmpeg indisponible:", e);
    throw new ApiError("CONVERSION_FAILED", "FFmpeg n'est pas disponible sur le serveur.");
  }
  if (result.timedOut) throw new ApiError("TIMEOUT");
  if (result.code !== 0) {
    console.error("[tokflow] ffmpeg a échoué:", result.stderr.slice(-600));
    throw new ApiError("CONVERSION_FAILED");
  }
}

/**
 * Convertit une source (vidéo ou piste audio) en MP3, avec un second essai par WAV brut.
 * Le premier essai échoue sur certaines pistes TikTok dont le format change en cours de
 * lecture (« Failed to configure output pad on auto_aresample ») ; le passage par un WAV
 * propre contourne le problème. Si les deux essais échouent, le code d'erreur est explicite
 * pour que le visiteur se voie proposer la vidéo à la place.
 */
export async function convertToMp3(source: string, output: string, bitrate: Mp3Bitrate, workDir: string): Promise<void> {
  try {
    await convert(mp3Args(source, output, bitrate));
    return;
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== "CONVERSION_FAILED") throw e;
    console.warn("[tokflow] conversion MP3 directe refusée, second essai par WAV");
  }
  const wav = `${workDir}/fallback.wav`;
  try {
    await convert(wavArgs(source, wav));
    await convert(mp3Args(wav, output, bitrate));
  } catch (e) {
    if (e instanceof ApiError) throw new ApiError("AUDIO_EXTRACTION_FAILED");
    throw e;
  }
}

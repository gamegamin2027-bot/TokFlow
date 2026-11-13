import { spawn } from "node:child_process";
import { config } from "../config";
import { ApiError } from "../errors";

export type ProbeResult = { durationSeconds?: number; hasVideo: boolean; hasAudio: boolean; width?: number; height?: number; fps?: number; videoCodec?: string; audioCodec?: string };

/** Lance un binaire, conserve la fin de sa sortie d'erreur et l'interrompt au-delà du délai. */
export function run(bin: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stderr: string; timedOut: boolean }> {
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
  const videoLine = stderr.match(/Stream #.*Video:.*/)?.[0] ?? "";
  const fps = videoLine.match(/(\d+(?:\.\d+)?) fps/);
  return {
    durationSeconds: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : undefined,
    hasVideo: /Stream #.*Video:/.test(stderr) && !/Video: (mjpeg|png)/.test(stderr.match(/Stream #.*Video:.*/)?.[0] ?? ""),
    hasAudio: /Stream #.*Audio:/.test(stderr),
    width: video ? Number(video[1]) : undefined,
    height: video ? Number(video[2]) : undefined,
    fps: fps ? Number(fps[1]) : undefined,
    videoCodec: videoLine.match(/Video: (\w+)/)?.[1],
    audioCodec: stderr.match(/Stream #.*Audio: (\w+)/)?.[1],
  };
}

/** Inspecte un fichier local avec `ffmpeg -i` (pas besoin de ffprobe). */
export async function probe(file: string): Promise<ProbeResult> {
  const { stderr } = await run(config.ffmpegPath, ["-hide_banner", "-i", file], 20_000);
  if (!/Input #0/.test(stderr)) throw new ApiError("UNSUPPORTED_MEDIA");
  return parseProbe(stderr);
}

/** Exécute FFmpeg et traduit tout échec en erreur d'API. Renvoie la fin de sa sortie d'erreur. */
export async function convert(args: string[], timeoutMs: number = config.jobTimeoutMs): Promise<string> {
  let result;
  try {
    result = await run(config.ffmpegPath, args, timeoutMs);
  } catch (e) {
    console.error("[tokflow] ffmpeg indisponible:", e);
    throw new ApiError("CONVERSION_FAILED", "FFmpeg n'est pas disponible sur le serveur.");
  }
  if (result.timedOut) throw new ApiError("TIMEOUT");
  if (result.code !== 0) {
    console.error("[tokflow] ffmpeg a échoué:", result.stderr.slice(-600));
    throw new ApiError("CONVERSION_FAILED");
  }
  return result.stderr;
}

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

export function mp3Args(input: string, output: string, bitrate: Mp3Bitrate): string[] {
  return ["-hide_banner", "-nostdin", "-y", "-i", input, "-vn", "-map", "0:a:0", "-c:a", "libmp3lame", "-b:a", `${bitrate}k`, "-ar", "44100", "-map_metadata", "-1", "-f", "mp3", output];
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

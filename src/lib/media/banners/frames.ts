import { spawn } from "node:child_process";
import { config } from "../../config";
import { ApiError } from "../../errors";
import { SIGNATURE_SIZE, signatureOf, type Signature } from "./detect";

export type FrameScan = {
  /** Une signature par image de la vidéo. */
  signatures: Signature[];
  /** Horodatage réel de chaque image, en secondes. */
  times: number[];
  /** Horodatages des images clés (points où une copie sans ré-encodage peut commencer). */
  keyframes: number[];
};

/**
 * Lit toute la vidéo une seule fois avec FFmpeg : chaque image est réduite à 32×32 pixels et
 * résumée à la volée (la vidéo n'est jamais chargée en mémoire). Le filtre `showinfo` fournit
 * l'horodatage exact de chaque image et signale les images clés.
 */
export function scanFrames(file: string, durationSeconds: number | undefined, onProgress?: (ratio: number) => void): Promise<FrameScan> {
  return new Promise((resolve, reject) => {
    const frameBytes = SIGNATURE_SIZE * SIGNATURE_SIZE * 3;
    const args = ["-hide_banner", "-nostdin", "-loglevel", "info", "-nostats", "-i", file, "-map", "0:v:0", "-an", "-sn", "-vf", `showinfo=checksum=0,scale=${SIGNATURE_SIZE}:${SIGNATURE_SIZE}:flags=area`, "-pix_fmt", "rgb24", "-fps_mode", "passthrough", "-f", "rawvideo", "-threads", "2", "pipe:1"];
    const child = spawn(config.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    const signatures: Signature[] = [];
    const times: number[] = [];
    const keyframes: number[] = [];
    let pending: Buffer = Buffer.alloc(0);
    let log = "";
    let tail = "";
    let settled = false;
    const fail = (e: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(e);
    };
    const timer = setTimeout(() => fail(new ApiError("TIMEOUT", "L'analyse de la vidéo a pris trop de temps.")), config.jobTimeoutMs * 2);

    child.stdout.on("data", (chunk: Buffer) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let offset = 0;
      while (pending.length - offset >= frameBytes) {
        signatures.push(signatureOf(pending.subarray(offset, offset + frameBytes)));
        offset += frameBytes;
      }
      pending = pending.subarray(offset);
    });
    child.stderr.on("data", (d: Buffer) => {
      log += d.toString();
      const lines = log.split("\n");
      log = lines.pop() ?? "";
      for (const line of lines) {
        const m = line.includes("showinfo") ? line.match(/pts_time:\s*(-?[\d.]+).*?iskey:(\d)/) : null;
        if (m) {
          const t = Number(m[1]);
          times.push(t);
          if (m[2] === "1") keyframes.push(t);
          if (durationSeconds && times.length % 30 === 0) onProgress?.(Math.min(1, t / durationSeconds));
        } else if (!line.includes("showinfo")) tail = (tail + line + "\n").slice(-1500);
      }
    });
    child.on("error", () => fail(new ApiError("CONVERSION_FAILED", "FFmpeg n'est pas disponible sur le serveur.")));
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 || !signatures.length) {
        console.error("[tokflow] analyse des images :", tail.slice(-400));
        return reject(new ApiError("UNSUPPORTED_MEDIA", "Cette vidéo n'a pas pu être analysée."));
      }
      // Horodatages incomplets (cas rare) : on retombe sur une cadence régulière.
      if (times.length !== signatures.length) {
        const step = (durationSeconds ?? signatures.length / 30) / signatures.length;
        times.length = 0;
        for (let i = 0; i < signatures.length; i++) times.push(i * step);
        keyframes.length = 0;
      } else if (times[0] !== 0) {
        // Les découpes utilisent des temps relatifs au début du fichier.
        const origin = times[0];
        for (let i = 0; i < times.length; i++) times[i] -= origin;
        for (let i = 0; i < keyframes.length; i++) keyframes[i] -= origin;
      }
      resolve({ signatures, times, keyframes });
    });
  });
}

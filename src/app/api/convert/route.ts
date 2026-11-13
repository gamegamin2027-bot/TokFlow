import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "@/lib/config";
import { ApiError, errorResponse } from "@/lib/errors";
import { convert, mp3Args, mp4Args, probe } from "@/lib/media/ffmpeg";
import { isMp3Bitrate, parseMp4Target, safeFileName } from "@/lib/media/formats";
import { acquireJob, createWorkDir, fileDownloadResponse } from "@/lib/media/jobs";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Convertit un fichier envoyé par l'utilisateur (corps brut de la requête).
 * Alternative lorsque le lien ne peut pas être traité.
 * Query : format=mp4|mp3, target=source|1080|720|480, bitrate=128|192|320, name=…
 */
export async function POST(req: Request) {
  let release: (() => void) | undefined;
  let cleanup: (() => Promise<void>) | undefined;
  const finish = () => {
    release?.();
    void cleanup?.();
  };
  try {
    checkRateLimit(`job:${clientIp(req)}`, config.rateLimit.jobsPerTenMinutes, 600_000);
    const q = new URL(req.url).searchParams;
    const format = q.get("format");
    if (format !== "mp4" && format !== "mp3") throw new ApiError("INVALID_REQUEST", "Format inconnu.");
    const bitrate = Number(q.get("bitrate") ?? 192);
    const target = parseMp4Target(q.get("target"));
    if (format === "mp3" && !isMp3Bitrate(bitrate)) throw new ApiError("INVALID_REQUEST", "Débit MP3 inconnu.");
    if (format === "mp4" && !target) throw new ApiError("INVALID_REQUEST", "Qualité inconnue.");

    const maxMb = Math.round(config.maxUploadBytes / 1024 / 1024);
    const tooLarge = () => new ApiError("FILE_TOO_LARGE", `Fichier trop volumineux (maximum ${maxMb} Mo).`);
    if (Number(req.headers.get("content-length") ?? 0) > config.maxUploadBytes) throw tooLarge();
    if (!req.body) throw new ApiError("INVALID_REQUEST", "Aucun fichier reçu.");

    release = acquireJob();
    const work = await createWorkDir();
    cleanup = work.cleanup;

    const input = join(work.dir, "input.bin");
    let received = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        cb(received > config.maxUploadBytes ? tooLarge() : null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]), limiter, createWriteStream(input));
    } catch (e) {
      throw e instanceof ApiError ? e : new ApiError("INVALID_REQUEST", "Le transfert du fichier a été interrompu.");
    }
    if (received === 0) throw new ApiError("INVALID_REQUEST", "Aucun fichier reçu.");

    const info = await probe(input);
    if (info.durationSeconds && info.durationSeconds > config.maxDurationSeconds) throw new ApiError("TOO_LONG");
    const base = (q.get("name") ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, "");

    if (format === "mp3") {
      if (!info.hasAudio) throw new ApiError("UNSUPPORTED_MEDIA", "Ce fichier ne contient pas de piste audio.");
      const out = join(work.dir, "out.mp3");
      await convert(mp3Args(input, out, bitrate as 128 | 192 | 320));
      return await fileDownloadResponse(out, safeFileName(base, "mp3"), "audio/mpeg", finish);
    }
    if (!info.hasVideo) throw new ApiError("UNSUPPORTED_MEDIA", "Ce fichier ne contient pas de piste vidéo.");
    const out = join(work.dir, "out.mp4");
    await convert(mp4Args(input, out, target!));
    return await fileDownloadResponse(out, safeFileName(base, "mp4"), "video/mp4", finish);
  } catch (err) {
    finish();
    return errorResponse(err);
  }
}

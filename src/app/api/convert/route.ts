import { join } from "node:path";
import { config } from "@/lib/config";
import { ApiError, errorResponse } from "@/lib/errors";
import { AUDIO_MIME, canCopyToM4a, m4aArgs, mp3Args } from "@/lib/media/audio";
import { convert, probe } from "@/lib/media/ffmpeg";
import { isMp3Bitrate, isOutputFormat, parseMp4Target, safeFileName } from "@/lib/media/formats";
import { acquireJob, createWorkDir, fileDownloadResponse } from "@/lib/media/jobs";
import { assertUploadAllowed, receiveUpload } from "@/lib/media/upload";
import { mp4Args } from "@/lib/media/video";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Convertit un fichier envoyé par l'utilisateur (corps brut de la requête).
 * Alternative lorsque le lien ne peut pas être traité.
 * Query : format=mp4|mp3|m4a, target=source|1080|720|480, bitrate=128|192|320, name=…
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
    if (!isOutputFormat(format)) throw new ApiError("INVALID_REQUEST", "Format inconnu.");
    const bitrate = Number(q.get("bitrate") ?? 192);
    const target = parseMp4Target(q.get("target"));
    if (format === "mp3" && !isMp3Bitrate(bitrate)) throw new ApiError("INVALID_REQUEST", "Débit MP3 inconnu.");
    if (format === "mp4" && !target) throw new ApiError("INVALID_REQUEST", "Qualité inconnue.");

    assertUploadAllowed(req);

    release = acquireJob();
    const work = await createWorkDir();
    cleanup = work.cleanup;

    const input = join(work.dir, "input.bin");
    await receiveUpload(req, input);

    const info = await probe(input);
    if (info.durationSeconds && info.durationSeconds > config.maxDurationSeconds) throw new ApiError("TOO_LONG");
    const base = (q.get("name") ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, "");

    if (format !== "mp4") {
      if (!info.hasAudio) throw new ApiError("UNSUPPORTED_MEDIA", "Ce fichier ne contient pas de piste audio.");
      const out = join(work.dir, `out.${format}`);
      await convert(format === "mp3" ? mp3Args(input, out, bitrate as 128 | 192 | 320) : m4aArgs(input, out, canCopyToM4a(info)));
      return await fileDownloadResponse(out, safeFileName(base, format), AUDIO_MIME[format], finish);
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

import { join } from "node:path";
import { config, linkDownloadEnabled } from "@/lib/config";
import { ApiError, errorResponse } from "@/lib/errors";
import { convert, mp3Args, mp4Args, probe } from "@/lib/media/ffmpeg";
import { isMp3Bitrate, safeFileName } from "@/lib/media/formats";
import { acquireJob, createWorkDir, fileDownloadResponse } from "@/lib/media/jobs";
import { downloadFromLink } from "@/lib/media/link-engine";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { parseTikTokUrl } from "@/lib/tiktok/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = { url?: unknown; format?: unknown; quality?: unknown; bitrate?: unknown };

/** Récupère une vidéo publique depuis son lien et la renvoie en MP4 ou MP3. */
export async function POST(req: Request) {
  let release: (() => void) | undefined;
  let cleanup: (() => Promise<void>) | undefined;
  const finish = () => {
    release?.();
    void cleanup?.();
  };
  try {
    if (!linkDownloadEnabled()) throw new ApiError("LINK_DOWNLOAD_DISABLED");
    checkRateLimit(`job:${clientIp(req)}`, config.rateLimit.jobsPerTenMinutes, 600_000);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) throw new ApiError("INVALID_REQUEST");
    const link = parseTikTokUrl(body.url);
    if (link.kind !== "video") throw new ApiError("INVALID_REQUEST", "Analysez d'abord le lien.");
    const format = body.format;
    if (format !== "mp4" && format !== "mp3") throw new ApiError("INVALID_REQUEST", "Format inconnu.");
    if (typeof body.quality !== "string" || !body.quality) throw new ApiError("INVALID_REQUEST", "Qualité manquante : analysez d'abord le lien.");
    const quality = body.quality;
    const bitrate = body.bitrate ?? 192;
    if (format === "mp3" && !isMp3Bitrate(bitrate)) throw new ApiError("INVALID_REQUEST", "Débit MP3 inconnu.");

    release = acquireJob();
    const work = await createWorkDir();
    cleanup = work.cleanup;

    const source = await downloadFromLink(link.url, work.dir, quality);
    const info = await probe(source);
    if (info.durationSeconds && info.durationSeconds > config.maxDurationSeconds) throw new ApiError("TOO_LONG");

    const base = `tiktok-${link.username}-${link.id}`;
    if (format === "mp3") {
      if (!info.hasAudio) throw new ApiError("UNSUPPORTED_MEDIA", "Cette vidéo ne contient pas de piste audio.");
      const out = join(work.dir, "out.mp3");
      await convert(mp3Args(source, out, bitrate as 128 | 192 | 320));
      return await fileDownloadResponse(out, safeFileName(base, "mp3"), "audio/mpeg", finish);
    }
    // MP4 : remux sans ré-encodage (vidéo + audio d'origine, démarrage rapide).
    const out = join(work.dir, "out.mp4");
    await convert(mp4Args(source, out, "source"));
    return await fileDownloadResponse(out, safeFileName(base, "mp4"), "video/mp4", finish);
  } catch (err) {
    finish();
    return errorResponse(err);
  }
}

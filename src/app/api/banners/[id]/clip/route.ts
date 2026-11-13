import { config } from "@/lib/config";
import { ApiError, errorResponse } from "@/lib/errors";
import { bannerFileName, checkRange, clipFile, getJob } from "@/lib/media/banners/service";
import { fileDownloadResponse, fileRangeResponse } from "@/lib/media/jobs";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Fichier vidéo d'une séquence : ?start=&end= (secondes), ?n= numéro de la bannière.
 * Avec ?inline=1, le fichier est servi en lecture (aperçu) au lieu d'être téléchargé.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkRateLimit(`file:${clientIp(req)}`, config.rateLimit.filesPerTenMinutes, 600_000);
    const q = new URL(req.url).searchParams;
    const job = getJob((await params).id);
    const { start, end } = checkRange(job, q.get("start"), q.get("end"));
    const n = Number(q.get("n") ?? 1);
    if (!Number.isInteger(n) || n < 1 || n > 999) throw new ApiError("INVALID_REQUEST", "Numéro de bannière invalide.");
    const { path, mode } = await clipFile(job, start, end);
    const res = q.get("inline") === "1" ? await fileRangeResponse(path, req, "video/mp4") : await fileDownloadResponse(path, bannerFileName(n), "video/mp4");
    res.headers.set("X-TokFlow-Clip", mode);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}

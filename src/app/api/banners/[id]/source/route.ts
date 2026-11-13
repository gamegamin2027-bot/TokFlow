import { ApiError, errorResponse } from "@/lib/errors";
import { getJob } from "@/lib/media/banners/service";
import { fileRangeResponse } from "@/lib/media/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vidéo analysée, en lecture seule : sert aux aperçus (lecture d'un passage, sans rien recalculer). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const job = getJob((await params).id);
    if (job.status !== "ready" || !job.source) throw new ApiError("CONFLICT", "L'analyse de cette vidéo n'est pas terminée.");
    return await fileRangeResponse(job.source, req, "video/mp4");
  } catch (err) {
    return errorResponse(err);
  }
}

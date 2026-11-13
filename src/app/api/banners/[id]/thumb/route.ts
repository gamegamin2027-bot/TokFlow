import { errorResponse } from "@/lib/errors";
import { getJob, thumbFile } from "@/lib/media/banners/service";
import { fileRangeResponse } from "@/lib/media/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vignette JPEG de la vidéo à l'instant ?at= (secondes). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const job = getJob((await params).id);
    return await fileRangeResponse(await thumbFile(job, new URL(req.url).searchParams.get("at")), req, "image/jpeg");
  } catch (err) {
    return errorResponse(err);
  }
}

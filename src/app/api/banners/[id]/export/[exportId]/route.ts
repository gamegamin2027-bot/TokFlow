import { errorResponse } from "@/lib/errors";
import { exportFile } from "@/lib/media/banners/service";
import { fileDownloadResponse } from "@/lib/media/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Télécharge l'archive ZIP une fois prête. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; exportId: string }> }) {
  try {
    const { id, exportId } = await params;
    const { path, fileName } = exportFile(id, exportId);
    return await fileDownloadResponse(path, fileName, "application/zip");
  } catch (err) {
    return errorResponse(err);
  }
}

import { NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/errors";
import { getJob, removeJob, setSensitivity, view } from "@/lib/media/banners/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const json = (data: unknown) => NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });

/** État d'une analyse : étape, avancement, séquences détectées, archive en préparation. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    return json(view(getJob((await params).id)));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Relance la détection avec une autre sensibilité (instantané : la vidéo n'est pas relue). */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const body = (await req.json().catch(() => null)) as { sensitivity?: unknown } | null;
    const s = body?.sensitivity;
    if (s !== "low" && s !== "normal" && s !== "high") throw new ApiError("INVALID_REQUEST", "Sensibilité inconnue.");
    return json(setSensitivity((await params).id, s));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Supprime tout de suite les fichiers temporaires de l'analyse. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await removeJob((await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}

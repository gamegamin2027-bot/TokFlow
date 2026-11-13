import { NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/errors";
import { BannerError } from "@/lib/banners/errors";

/** Réponse d'erreur au format commun de l'API : { error: { code, message } }. */
export function bannerError(err: unknown): NextResponse {
  if (err instanceof BannerError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status, headers: { "Cache-Control": "no-store" } });
  }
  if (!(err instanceof ApiError)) console.error("[tokflow] bannières :", err);
  return errorResponse(err);
}

/** Corps JSON de petite taille uniquement : ces routes ne reçoivent qu'un lien ou une liste de numéros. */
export async function readSmallJson(req: Request): Promise<Record<string, unknown>> {
  if (Number(req.headers.get("content-length")) > 20_000) throw new BannerError("TOO_LARGE", "Requête trop volumineuse.", 413);
  const text = await req.text();
  if (text.length > 20_000) throw new BannerError("TOO_LARGE", "Requête trop volumineuse.", 413);
  try {
    const body: unknown = JSON.parse(text || "{}");
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* ci-dessous */
  }
  throw new BannerError("BAD_JSON", "Requête illisible.");
}

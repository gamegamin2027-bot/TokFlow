import { ApiError, errorResponse } from "@/lib/errors";
import { isAllowedThumbnailUrl } from "@/lib/tiktok/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/** Proxy d'images limité aux CDN TikTok (liste blanche), pour un aperçu fiable. */
export async function GET(req: Request) {
  try {
    const target = new URL(req.url).searchParams.get("u") ?? "";
    if (!isAllowedThumbnailUrl(target)) throw new ApiError("INVALID_REQUEST");

    const upstream = await fetch(target, { signal: AbortSignal.timeout(8000), redirect: "error" }).catch(() => null);
    if (!upstream?.ok) throw new ApiError("NOT_FOUND", "Miniature indisponible.");
    const type = upstream.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new ApiError("UNSUPPORTED_MEDIA");
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new ApiError("FILE_TOO_LARGE");

    return new Response(buf, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

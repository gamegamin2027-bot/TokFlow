import { config, linkDownloadEnabled } from "@/lib/config";
import { ApiError, errorResponse } from "@/lib/errors";
import { previewStream } from "@/lib/media/link-engine";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { parseTikTokUrl } from "@/lib/tiktok/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Aperçu de la vidéo dans la page. Le serveur relaie le flux public de TikTok :
 * l'adresse du CDN n'est jamais exposée et le navigateur n'est pas refusé par TikTok.
 * `u` = lien de la vidéo, `q` = qualité demandée (identifiant fourni par /api/resolve).
 */
export async function GET(req: Request) {
  try {
    if (!linkDownloadEnabled()) throw new ApiError("LINK_DOWNLOAD_DISABLED");
    checkRateLimit(`preview:${clientIp(req)}`, config.rateLimit.previewsPerTenMinutes, 600_000);

    const params = new URL(req.url).searchParams;
    const link = parseTikTokUrl(params.get("u"));
    if (link.kind !== "video") throw new ApiError("INVALID_REQUEST", "Seule une vidéo peut être lue ici.");

    const stream = await previewStream(link.url, params.get("q") ?? "", req.signal);
    return new Response(stream, {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        // Le flux est produit à la demande : la taille n'est pas connue à l'avance.
        "Accept-Ranges": "none",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

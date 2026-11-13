import { NextResponse } from "next/server";
import { config, linkDownloadEnabled } from "@/lib/config";
import { ApiError, errorResponse } from "@/lib/errors";
import { startFromLink, startFromUpload } from "@/lib/media/banners/service";
import { safeFileName } from "@/lib/media/formats";
import { assertUploadAllowed, receiveUpload } from "@/lib/media/upload";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { parseTikTokUrl } from "@/lib/tiktok/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Démarre une analyse de bannières et répond tout de suite avec son identifiant ;
 * l'avancement se lit ensuite sur GET /api/banners/{id}.
 * - JSON { url, quality } : vidéo publique récupérée par son lien ;
 * - corps brut (fichier vidéo) avec ?name=… : fichier envoyé par l'utilisateur.
 */
export async function POST(req: Request) {
  try {
    const owner = clientIp(req);
    checkRateLimit(`job:${owner}`, config.rateLimit.jobsPerTenMinutes, 600_000);

    if (req.headers.get("content-type")?.includes("application/json")) {
      if (!linkDownloadEnabled()) throw new ApiError("LINK_DOWNLOAD_DISABLED");
      const body = (await req.json().catch(() => null)) as { url?: unknown; quality?: unknown } | null;
      if (!body) throw new ApiError("INVALID_REQUEST");
      const link = parseTikTokUrl(body.url);
      if (link.kind !== "video") throw new ApiError("INVALID_REQUEST", "Récupérez d'abord la vidéo.");
      if (typeof body.quality !== "string" || !body.quality) throw new ApiError("INVALID_REQUEST", "Qualité manquante : récupérez d'abord la vidéo.");
      return NextResponse.json(await startFromLink(owner, link.url, link.id, body.quality), { status: 202, headers: { "Cache-Control": "no-store" } });
    }

    assertUploadAllowed(req);
    const name = (new URL(req.url).searchParams.get("name") ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, "");
    const label = safeFileName(name, "x").slice(0, -2);
    return NextResponse.json(await startFromUpload(owner, label, (path) => receiveUpload(req, path)), { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

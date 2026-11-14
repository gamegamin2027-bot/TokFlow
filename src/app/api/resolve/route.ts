import { NextResponse } from "next/server";
import { config, linkDownloadEnabled } from "@/lib/config";
import { ApiError, errorResponse } from "@/lib/errors";
import { fetchLinkMetadata, type LinkMetadata } from "@/lib/media/link-engine";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { fetchOEmbed, type OEmbedInfo } from "@/lib/tiktok/oembed";
import { extractTikTokLink, isAllowedThumbnailUrl, parseTikTokUrl, resolveTikTokLink } from "@/lib/tiktok/url";
import type { AnalyzeResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let refused: unknown;
  try {
    checkRateLimit(`resolve:${clientIp(req)}`, config.rateLimit.analyzePerMinute, 60_000);

    const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
    if (!body) throw new ApiError("INVALID_REQUEST");
    refused = body.url;
    const link = await resolveTikTokLink(parseTikTokUrl(body.url));

    const [oembed, meta] = await Promise.allSettled([
      fetchOEmbed(link.url, link.id),
      linkDownloadEnabled() ? fetchLinkMetadata(link.url) : Promise.resolve(null),
    ]);

    // Une vidéo privée ou supprimée est une erreur franche, jamais un aperçu vide.
    for (const r of [meta, oembed]) {
      if (r.status === "rejected" && r.reason instanceof ApiError && ["NOT_FOUND", "VIDEO_DELETED", "VIDEO_PRIVATE"].includes(r.reason.code)) throw r.reason;
    }
    if (oembed.status === "rejected" && meta.status === "rejected") throw oembed.reason;

    const o: Partial<OEmbedInfo> = oembed.status === "fulfilled" ? oembed.value : {};
    const m: LinkMetadata | null = meta.status === "fulfilled" ? meta.value : null;

    let linkUnavailableReason: string | undefined;
    if (!linkDownloadEnabled()) linkUnavailableReason = "Le téléchargement par lien n'est pas activé sur cette instance.";
    else if (!m) linkUnavailableReason = meta.status === "rejected" && meta.reason instanceof ApiError ? meta.reason.message : "Le flux de cette vidéo n'a pas pu être lu.";
    else if (m.watermarkedOnly) linkUnavailableReason = "TikTok ne met à disposition pour cette vidéo qu'une version avec filigrane incrusté. TokFlow ne fournit que des fichiers sans filigrane et ne retouche jamais l'image : ce lien ne peut donc pas être traité.";
    else if (m.qualities.length === 0) linkUnavailableReason = "Aucun flux vidéo public n'est proposé pour ce contenu (diaporama photo ou format non pris en charge).";
    else if (m.durationSeconds && m.durationSeconds > config.maxDurationSeconds) linkUnavailableReason = `Cette vidéo dépasse la durée maximale traitée (${Math.round(config.maxDurationSeconds / 60)} min).`;

    const thumb = m?.thumbnailUrl ?? o.thumbnailUrl;
    const result: AnalyzeResult = {
      id: link.id,
      url: link.url,
      username: link.username,
      title: m?.title ?? o.title,
      authorName: m?.authorName ?? o.authorName,
      thumbnail: thumb && isAllowedThumbnailUrl(thumb) ? `/api/thumbnail?u=${encodeURIComponent(thumb)}` : undefined,
      playerUrl: o.playerUrl ?? `https://www.tiktok.com/player/v1/${link.id}`,
      durationSeconds: m?.durationSeconds,
      linkDownload: !linkUnavailableReason,
      linkUnavailableReason,
      engineDetail: meta.status === "rejected" ? (meta.reason as { detail?: string })?.detail : undefined,
      qualities: linkUnavailableReason ? [] : (m?.qualities ?? []),
    };
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // Filet de sécurité : chaque lien refusé laisse une trace technique (adresse sans ses paramètres, jamais l'adresse IP),
    // pour repérer une écriture de lien que TokFlow ne connaîtrait pas encore.
    if (err instanceof ApiError && ["UNSUPPORTED_URL", "INVALID_URL", "LINK_DEAD"].includes(err.code) && typeof refused === "string") {
      console.warn(`[tokflow] lien refusé (${err.code}${(err as { reason?: string }).reason ? `/${(err as { reason?: string }).reason}` : ""}) : ${extractTikTokLink(refused).split(/[?#]/)[0].replace(/[^\x21-\x7E]/g, "?").slice(0, 160)}`);
    }
    return errorResponse(err);
  }
}

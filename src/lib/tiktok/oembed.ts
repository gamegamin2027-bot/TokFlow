import { ApiError } from "../errors";

export type OEmbedInfo = {
  title?: string;
  authorName?: string;
  thumbnailUrl?: string;
};

/**
 * Interroge l'endpoint oEmbed officiel de TikTok.
 * https://developers.tiktok.com/doc/embed-videos/
 * Selon la région du serveur, TikTok peut ne renvoyer que les champs du lecteur.
 */
export async function fetchOEmbed(videoUrl: string, fetchImpl: typeof fetch = fetch): Promise<OEmbedInfo> {
  let res: Response;
  try {
    res = await fetchImpl(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("UPSTREAM_ERROR");
  }
  if (res.status === 400 || res.status === 404) throw new ApiError("NOT_FOUND");
  if (!res.ok) throw new ApiError("UPSTREAM_ERROR");

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError("UPSTREAM_ERROR");
  }
  if (typeof data.status_msg === "string" && data.status_msg && !data.html) throw new ApiError("NOT_FOUND");

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    title: str(data.title),
    authorName: str(data.author_name),
    thumbnailUrl: str(data.thumbnail_url),
  };
}

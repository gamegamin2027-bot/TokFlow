import { ApiError } from "../errors";
import { parseTikTokUrl, resolveTikTokPost, type TikTokLink } from "../tiktok/url";
import { BannerError } from "./errors";

export type PostLink = { id: string; username: string; kind: "video" | "photo"; canonical: string };

/**
 * Transforme un lien collé (classique ou court) en lien canonique de publication.
 * La reconnaissance des liens est la même que pour les vidéos (`tiktok/url.ts`) : mêmes écritures acceptées,
 * mêmes protections (domaines TikTok uniquement, redirections suivies à la main).
 */
export async function resolvePostLink(raw: unknown): Promise<PostLink> {
  if (typeof raw !== "string" || raw.length > 2048) throw new BannerError("INVALID_URL", "Collez un lien TikTok.");
  let link: TikTokLink;
  try {
    link = parseTikTokUrl(raw);
  } catch (e) {
    if (e instanceof ApiError && e.code === "UNSUPPORTED_URL") {
      if ((e as { reason?: string }).reason === "host") throw new BannerError("NOT_TIKTOK", "Ce lien ne provient pas de TikTok.");
      throw new BannerError("NOT_A_POST", "Ce lien TikTok ne désigne pas une publication (vidéo ou photos).");
    }
    throw new BannerError("INVALID_URL", "Ce texte n'est pas une adresse TikTok valide.");
  }
  try {
    const found = await resolveTikTokPost(link);
    return { id: found.id, username: found.username, kind: found.kind, canonical: found.url };
  } catch (e) {
    if (e instanceof ApiError && e.code === "LINK_DEAD") throw new BannerError("LINK_DEAD", "Ce lien court ne mène à aucune publication (expiré ou supprimé).", 404);
    throw new BannerError("TIKTOK_UNREACHABLE", "TikTok n'a pas répondu. Réessayez dans un instant.", 502);
  }
}

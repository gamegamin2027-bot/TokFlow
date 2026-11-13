import { BannerError } from "./errors";
import { fetchBytes } from "./http";
import type { PostLink } from "./link";

export type PublicImage = { urls: string[]; width?: number; height?: number };
export type PublicPost = { id: string; author: string; title: string; images: PublicImage[] };

/**
 * Source n° 1 : la page publique de TikTok, sans compte ni cookies.
 * Renvoie les images du carrousel (toujours fixes) et les informations de la publication.
 */
export async function fetchPublicPost(link: PostLink): Promise<PublicPost> {
  // La page « /video/ » contient les mêmes données, y compris pour une publication photo.
  // « follow » est acceptable ici : l'adresse est construite par nous, sur www.tiktok.com, et la réponse
  // n'est lue que comme du texte (4 Mo au plus) pour en extraire des adresses, elles-mêmes filtrées ensuite.
  let res;
  try {
    res = await fetchBytes(`https://www.tiktok.com/@${link.username}/video/${link.id}`, { timeoutMs: 15000, maxBytes: 4_000_000, redirect: "follow" });
  } catch {
    throw new BannerError("TIKTOK_UNREACHABLE", "TikTok n'a pas répondu. Réessayez dans un instant.", 502);
  }
  if (res.status < 200 || res.status >= 300) throw new BannerError("TIKTOK_ERROR", `TikTok a répondu par une erreur (${res.status}).`, 502);
  const m = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(res.body.toString("utf8"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- données externes, lues champ par champ ci-dessous
  let detail: any;
  try {
    detail = JSON.parse(m![1]).__DEFAULT_SCOPE__["webapp.video-detail"];
  } catch {
    throw new BannerError("TIKTOK_FORMAT", "La page TikTok n'a pas le format attendu. Réessayez dans un instant.", 502);
  }
  const item = detail?.itemInfo?.itemStruct;
  if (detail && (detail.statusCode === 10204 || (!item && detail.statusCode))) throw new BannerError("POST_UNAVAILABLE", "Cette publication est introuvable : supprimée, privée ou réservée.", 404);
  if (!item) throw new BannerError("TIKTOK_FORMAT", "La page TikTok ne contient pas les données de la publication. Réessayez dans un instant.", 502);
  if (item.privateItem) throw new BannerError("POST_UNAVAILABLE", "Cette publication est privée.", 404);

  const list: unknown[] = Array.isArray(item.imagePost?.images) ? item.imagePost.images : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const images = list.map((image: any) => ({
    urls: (Array.isArray(image?.imageURL?.urlList) ? image.imageURL.urlList : []).filter((u: unknown): u is string => typeof u === "string"),
    width: Number(image?.imageWidth) || undefined,
    height: Number(image?.imageHeight) || undefined,
  }));
  return { id: String(item.id), author: typeof item.author?.uniqueId === "string" ? item.author.uniqueId : link.username, title: String(item.imagePost?.title || item.desc || ""), images };
}

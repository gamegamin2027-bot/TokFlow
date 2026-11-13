import { BannerError } from "./errors";
import { extractTikTokLink } from "../tiktok/url";
import { fetchBytes } from "./http";

export type PostLink = { id: string; username: string; kind: "video" | "photo"; canonical: string };

const PAGE_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);
const POST = /^\/@([A-Za-z0-9._-]{1,64})\/(video|photo)\/(\d{8,25})\/?$/;

function parse(raw: unknown): URL {
  let text = String(raw ?? "").trim();
  if (text && !/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new BannerError("INVALID_URL", "Ce texte n'est pas une adresse valide.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new BannerError("INVALID_URL", "Seules les adresses web sont acceptées.");
  if (url.username || url.password || (url.port && url.port !== "443")) throw new BannerError("INVALID_URL", "Adresse non acceptée.");
  url.protocol = "https:";
  return url;
}

/**
 * Transforme un lien collé (classique ou court) en lien canonique de publication.
 * Les redirections sont suivies à la main, 5 au maximum, et uniquement vers des domaines TikTok :
 * aucune autre adresse n'est jamais contactée.
 */
export async function resolvePostLink(raw: unknown): Promise<PostLink> {
  if (typeof raw !== "string" || raw.length > 2048) throw new BannerError("INVALID_URL", "Collez un lien TikTok.");
  let url = parse(extractTikTokLink(raw));
  for (let hop = 0; hop < 6; hop++) {
    const host = url.hostname.toLowerCase();
    if (PAGE_HOSTS.has(host)) {
      const m = POST.exec(url.pathname);
      if (m) return { id: m[3], username: m[1], kind: m[2] as "video" | "photo", canonical: `https://www.tiktok.com/@${m[1]}/${m[2]}/${m[3]}` };
      if (!/^\/(t|v)\//.test(url.pathname)) throw new BannerError("NOT_A_POST", "Ce lien TikTok ne désigne pas une publication (vidéo ou photos).");
    } else if (!SHORT_HOSTS.has(host)) {
      throw new BannerError("NOT_TIKTOK", "Ce lien ne provient pas de TikTok.");
    }
    if (hop === 5) break;
    let res;
    try {
      res = await fetchBytes(url, { timeoutMs: 10000 });
    } catch {
      throw new BannerError("TIKTOK_UNREACHABLE", "TikTok n'a pas répondu. Réessayez dans un instant.", 502);
    }
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) throw new BannerError("LINK_DEAD", "Ce lien court ne mène à aucune publication (expiré ou supprimé).", 404);
    url = parse(new URL(location, url).toString());
  }
  throw new BannerError("TOO_MANY_REDIRECTS", "Ce lien redirige trop de fois.");
}

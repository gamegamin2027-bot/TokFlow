import { ApiError } from "../errors";

export type TikTokLink =
  | { kind: "video"; url: string; id: string; username: string }
  | { kind: "short"; url: string };

const CANONICAL_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

/**
 * Isole le lien TikTok d'un texte collé. Le bouton « Partager » de certaines applications copie
 * une phrase entière (« Regarde cette vidéo ! https://vm.tiktok.com/… ») : seul le lien est gardé.
 */
export function extractTikTokLink(text: string): string {
  const trimmed = text.trim();
  if (!/\s/.test(trimmed)) return trimmed;
  for (const word of trimmed.split(/\s+/)) {
    const candidate = word.replace(/^[(<«"']+/, "").replace(/[)>»"',.;!?]+$/, "");
    if (/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*tiktok\.com\//i.test(candidate)) return candidate;
  }
  return trimmed;
}

/** Autres écritures d'une même vidéo : ancien lien mobile, lien de partage, lecteur intégré. */
const ALTERNATE_VIDEO_PATHS = [/^\/v\/(\d{8,25})(?:\.html)?\/?$/, /^\/share\/video\/(\d{8,25})\/?$/, /^\/embed(?:\/v[0-9])?\/(\d{8,25})\/?$/, /^\/player\/v1\/(\d{8,25})\/?$/];

/**
 * Valide et normalise un lien TikTok. Seuls les hôtes TikTok connus sont
 * acceptés : aucune autre URL n'est jamais requêtée côté serveur (anti-SSRF).
 */
export function parseTikTokUrl(input: unknown): TikTokLink {
  if (typeof input !== "string") throw new ApiError("INVALID_URL");
  if (input.length > 2048) throw new ApiError("INVALID_URL");
  let raw = extractTikTokLink(input);
  if (!raw) throw new ApiError("INVALID_URL");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ApiError("INVALID_URL");
  }
  if (u.username || u.password || (u.port && u.port !== "443")) throw new ApiError("INVALID_URL");

  const host = u.hostname.toLowerCase();

  if (CANONICAL_HOSTS.has(host)) {
    // Le nom du compte peut manquer (« /@/video/… ») : TikTok retrouve la vidéo par son seul numéro.
    const video = u.pathname.match(/^\/@([A-Za-z0-9._-]{0,64})\/video\/(\d{8,25})\/?$/);
    if (video) {
      const [, username, id] = video;
      return { kind: "video", id, username, url: `https://www.tiktok.com/@${username || "_"}/video/${id}` };
    }
    for (const pattern of ALTERNATE_VIDEO_PATHS) {
      const alt = u.pathname.match(pattern);
      if (alt) return { kind: "video", id: alt[1], username: "", url: `https://www.tiktok.com/@_/video/${alt[1]}` };
    }
    const short = u.pathname.match(/^\/t\/([A-Za-z0-9_-]{5,24})\/?$/);
    if (short) return { kind: "short", url: `https://www.tiktok.com/t/${short[1]}/` };
    throw new ApiError("UNSUPPORTED_URL");
  }

  if (SHORT_HOSTS.has(host)) {
    const short = u.pathname.match(/^\/([A-Za-z0-9_-]{5,24})\/?$/);
    if (short) return { kind: "short", url: `https://${host}/${short[1]}/` };
    throw new ApiError("UNSUPPORTED_URL");
  }

  throw new ApiError("UNSUPPORTED_URL", "Seuls les liens tiktok.com sont pris en charge.");
}

/**
 * Résout un lien court (vm.tiktok.com…). TikTok redirige parfois en deux temps (lien court → lien de partage → vidéo) :
 * quatre redirections au plus sont suivies, à la main, et uniquement vers des domaines TikTok.
 */
export async function resolveTikTokLink(
  link: TikTokLink,
  fetchImpl: typeof fetch = fetch,
): Promise<Extract<TikTokLink, { kind: "video" }>> {
  let current = link;
  for (let hop = 0; hop < 4 && current.kind === "short"; hop++) {
    let location: string | null = null;
    try {
      const res = await fetchImpl(current.url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "TokFlow/1.0 (+link-resolver)" },
      });
      location = res.headers.get("location");
      await res.body?.cancel();
    } catch {
      throw new ApiError("UPSTREAM_ERROR");
    }
    if (!location) throw new ApiError("NOT_FOUND");
    let next: string;
    try {
      next = new URL(location, current.url).toString().split(/[?#]/)[0];
    } catch {
      throw new ApiError("UNSUPPORTED_URL");
    }
    current = parseTikTokUrl(next);
  }
  if (current.kind !== "video") throw new ApiError("UNSUPPORTED_URL");
  return current;
}

const THUMBNAIL_HOST_SUFFIXES = [".tiktokcdn.com", ".tiktokcdn-us.com", ".tiktokcdn-eu.com", ".ttwstatic.com", ".tiktokv.com"];

export function isAllowedThumbnailUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.port || u.username) return false;
    const host = u.hostname.toLowerCase();
    return THUMBNAIL_HOST_SUFFIXES.some((s) => host.endsWith(s));
  } catch {
    return false;
  }
}

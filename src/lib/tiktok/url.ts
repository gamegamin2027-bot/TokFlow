import { ApiError } from "../errors";

export type TikTokLink =
  | { kind: "video"; url: string; id: string; username: string }
  | { kind: "short"; url: string };

const CANONICAL_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

/**
 * Valide et normalise un lien TikTok. Seuls les hôtes TikTok connus sont
 * acceptés : aucune autre URL n'est jamais requêtée côté serveur (anti-SSRF).
 */
export function parseTikTokUrl(input: unknown): TikTokLink {
  if (typeof input !== "string") throw new ApiError("INVALID_URL");
  let raw = input.trim();
  if (!raw || raw.length > 2048) throw new ApiError("INVALID_URL");
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
    const video = u.pathname.match(/^\/@([A-Za-z0-9._]{1,32})\/video\/(\d{8,25})\/?$/);
    if (video) {
      const [, username, id] = video;
      return { kind: "video", id, username, url: `https://www.tiktok.com/@${username}/video/${id}` };
    }
    const short = u.pathname.match(/^\/t\/([A-Za-z0-9]{5,20})\/?$/);
    if (short) return { kind: "short", url: `https://www.tiktok.com/t/${short[1]}/` };
    throw new ApiError("UNSUPPORTED_URL");
  }

  if (SHORT_HOSTS.has(host)) {
    const short = u.pathname.match(/^\/([A-Za-z0-9]{5,20})\/?$/);
    if (short) return { kind: "short", url: `https://${host}/${short[1]}/` };
    throw new ApiError("UNSUPPORTED_URL");
  }

  throw new ApiError("UNSUPPORTED_URL", "Seuls les liens tiktok.com sont pris en charge.");
}

/** Résout un lien court (vm.tiktok.com…) en suivant une seule redirection vers tiktok.com. */
export async function resolveTikTokLink(
  link: TikTokLink,
  fetchImpl: typeof fetch = fetch,
): Promise<Extract<TikTokLink, { kind: "video" }>> {
  if (link.kind === "video") return link;
  let location: string | null = null;
  try {
    const res = await fetchImpl(link.url, {
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
  const resolved = parseTikTokUrl(location.split("?")[0]);
  if (resolved.kind !== "video") throw new ApiError("UNSUPPORTED_URL");
  return resolved;
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

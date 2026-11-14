import { ApiError } from "../errors";

/** Publication TikTok reconnue : vidéo, carrousel de photos, ou lien court qu'il reste à suivre. */
export type TikTokPost = { kind: "video" | "photo"; url: string; id: string; username: string };
export type TikTokLink = TikTokPost | { kind: "short"; url: string };

/** Caractères invisibles que certaines applications glissent dans le texte copié (espaces sans largeur, marques de sens d'écriture). */
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const TIKTOK_START = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*tiktokv?\.com(?:[/?#]|$)/i;
/** Lien collé contre du texte (« Regarde!https://vm.tiktok.com/… ») : il doit commencer par son protocole et ne pas faire partie d'une autre adresse. */
const GLUED = /(?:^|[^A-Za-z0-9@/.=&?:%#_~+-])(https?:\/\/(?:[a-z0-9-]+\.)*tiktokv?\.com\/[^\s<>"'«»“”()\[\]{}|\\^`\u3000-\u303F\uFF00-\uFFEF]*)/i;
const unwrap = (word: string) => word.replace(/^[(<\[{«“"'`*_]+/, "").replace(/[)>\]}»”"'`*_,.;:!?…]+$/, "");

/**
 * Isole le lien TikTok d'un texte collé. Le bouton « Partager » de certaines applications copie
 * une phrase entière (« Regarde cette vidéo ! https://vm.tiktok.com/… ») : seul le lien est gardé.
 */
export function extractTikTokLink(text: string): string {
  const trimmed = text.replace(INVISIBLE, "").trim();
  for (const word of trimmed.split(/\s+/)) {
    const candidate = unwrap(word);
    if (TIKTOK_START.test(candidate)) return candidate;
  }
  const glued = GLUED.exec(trimmed);
  if (glued) return unwrap(glued[1]);
  return /\s/.test(trimmed) ? trimmed : unwrap(trimmed);
}

/** Répare les fautes de frappe courantes au début d'une adresse (« https:/ », « https// », « ttps:// », protocole en double). */
function withProtocol(raw: string): string {
  let text = raw.replace(/^(?:h?t?tps?[:;]?\/{1,3})+/i, "https://");
  if (!/^https:\/\//.test(text)) text = `https://${text}`;
  return text;
}

type Unrecognised = { kind: "none"; reason: "host" | "home" | "page" };

const ID = "(\\d{8,25})";
const POST_PATH = new RegExp(`^/@([^/]*)/(video|photo)/${ID}(?:[/.].*)?$`);
/** Autres écritures d'une même publication : ancien lien mobile, lien de partage, lecteur intégré. */
const ALTERNATE_PATHS: [RegExp, "video" | "photo"][] = [
  [new RegExp(`^/v/${ID}(?:\\.html)?/?$`), "video"],
  [new RegExp(`^/(?:i18n/)?share/(?:video|item)/${ID}/?$`), "video"],
  [new RegExp(`^/(?:i18n/)?share/photo/${ID}/?$`), "photo"],
  [new RegExp(`^/embed(?:/v[0-9])?/${ID}/?$`), "video"],
  [new RegExp(`^/player/v[0-9]/${ID}/?$`), "video"],
  [new RegExp(`^/video/${ID}/?$`), "video"],
  [new RegExp(`^/photo/${ID}/?$`), "photo"],
];
const SHORT_CODE = "([A-Za-z0-9_-]{3,64})";
const SHORT_ON_PAGE_HOST = new RegExp(`^/t/${SHORT_CODE}/?$`);
const SHORT_ON_SHORT_HOST = new RegExp(`^/(?:t/)?${SHORT_CODE}/?$`);
/** Paramètres par lesquels TikTok transmet parfois le numéro de la vidéo, ou l'adresse à ouvrir ensuite. */
const ID_PARAMS = ["item_id", "share_item_id", "aweme_id", "video_id", "itemId"];
const NESTED_PARAMS = ["redirect_url", "redirect", "redirect_uri", "url", "u", "target", "next"];
const HOME_PATHS = /^\/(?:foryou|explore|following|friends|login|signup|404|notfound)?\/?$/i;

const cleanUsername = (raw: string) => {
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    /* nom laissé tel quel */
  }
  return /^[A-Za-z0-9._-]{1,64}$/.test(name) ? name : "";
};
const post = (kind: "video" | "photo", id: string, username = ""): TikTokPost => ({ kind, id, username, url: `https://www.tiktok.com/@${username || "_"}/${kind}/${id}` });

/**
 * Reconnaît une adresse TikTok, quelle que soit son écriture. Seuls les domaines de TikTok sont acceptés,
 * et l'adresse rendue est toujours reconstruite : rien de ce que le visiteur a saisi n'est requêté tel quel (anti-SSRF).
 */
function classify(u: URL, depth = 0): TikTokLink | Unrecognised {
  if (u.username || u.password || (u.port && u.port !== "443")) return { kind: "none", reason: "host" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const legacy = host === "tiktokv.com" || host.endsWith(".tiktokv.com");
  if (!legacy && host !== "tiktok.com" && !host.endsWith(".tiktok.com")) return { kind: "none", reason: "host" };

  // « //@compte » ou « /fr/@compte » : barres en double et préfixe de langue retirés.
  const path = u.pathname.replace(/\/{2,}/g, "/").replace(/^\/[a-z]{2}(?:-[A-Za-z]{2,4})?(?=\/(?:@|video\/|photo\/|share\/|embed\/|v\/|t\/))/, "");

  const direct = POST_PATH.exec(path);
  if (direct) return post(direct[2] as "video" | "photo", direct[3], cleanUsername(direct[1]));
  for (const [pattern, kind] of ALTERNATE_PATHS) {
    const alt = pattern.exec(path);
    if (alt) return post(kind, alt[1]);
  }
  if (!legacy) {
    const short = (/^(?:vm|vt)\./.test(host) ? SHORT_ON_SHORT_HOST : SHORT_ON_PAGE_HOST).exec(path);
    // Les liens courts ne sont suivis que sur les serveurs de redirection connus de TikTok.
    if (short) return { kind: "short", url: /^(?:vm|vt)\.tiktok\.com$/.test(host) ? `https://${host}/${short[1]}/` : `https://www.tiktok.com/t/${short[1]}/` };
  }
  for (const name of ID_PARAMS) {
    const value = u.searchParams.get(name);
    if (value && /^\d{8,25}$/.test(value)) return post("video", value);
  }
  if (depth === 0) {
    for (const name of NESTED_PARAMS) {
      const value = u.searchParams.get(name);
      if (!value || value.length > 1024 || !TIKTOK_START.test(value)) continue;
      try {
        const nested = classify(new URL(withProtocol(value)), 1);
        if (nested.kind !== "none") return nested;
      } catch {
        /* paramètre ignoré */
      }
    }
  }
  return { kind: "none", reason: HOME_PATHS.test(path) ? "home" : "page" };
}

const NOT_TIKTOK = "Ce lien ne vient pas de TikTok. Collez le lien d'une vidéo TikTok (bouton Partager, puis Copier le lien).";
const NOT_A_POST = "Ce lien TikTok mène à un profil, un son ou une autre page, pas à une vidéo. Ouvrez la vidéo, touchez Partager, puis Copier le lien.";

/** Erreur « lien non pris en charge », avec sa raison : autre site (« host ») ou page TikTok qui n'est pas une publication (« page »). */
export const unsupported = (reason: "host" | "page") => Object.assign(new ApiError("UNSUPPORTED_URL", reason === "host" ? NOT_TIKTOK : NOT_A_POST), { reason });

/** Valide et normalise un lien TikTok collé par le visiteur. */
export function parseTikTokUrl(input: unknown): TikTokLink {
  if (typeof input !== "string") throw new ApiError("INVALID_URL");
  if (input.length > 2048) throw new ApiError("INVALID_URL");
  const raw = extractTikTokLink(input);
  if (!raw) throw new ApiError("INVALID_URL");
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^h?t?tps?[:;]?\//i.test(raw)) throw new ApiError("INVALID_URL");

  let u: URL;
  try {
    u = new URL(withProtocol(raw));
  } catch {
    throw new ApiError("INVALID_URL");
  }
  if (u.username || u.password || (u.port && u.port !== "443")) throw new ApiError("INVALID_URL");

  const link = classify(u);
  if (link.kind === "none") throw unsupported(link.reason === "host" ? "host" : "page");
  return link;
}

const BROWSERS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
];
const LINK_DEAD = "Ce lien court ne mène plus à aucune vidéo : il a expiré, ou la vidéo a été supprimée. Ouvrez la vidéo dans TikTok et copiez de nouveau son lien.";

/** Lit au plus `limit` octets d'une réponse, puis coupe la connexion. */
async function readStart(res: Response, limit: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Quand TikTok répond par une page au lieu d'une redirection, l'adresse officielle de la publication y figure.
 * Seules les balises qui désignent LA page sont lues : jamais les liens vers d'autres vidéos qu'elle contient.
 */
function postDeclaredBy(html: string): TikTokPost | null {
  const tags = [/<link[^>]+rel=["']canonical["'][^>]*>/i, /<meta[^>]+property=["']og:url["'][^>]*>/i];
  for (const tag of tags) {
    const address = /(?:href|content)=["']([^"']+)["']/i.exec(tag.exec(html)?.[0] ?? "")?.[1];
    if (!address) continue;
    try {
      const found = classify(new URL(address.replace(/&amp;/g, "&")), 1);
      if (found.kind === "video" || found.kind === "photo") return found;
    } catch {
      /* balise ignorée */
    }
  }
  return null;
}

/**
 * Suit un lien court (vm.tiktok.com…) jusqu'à la publication. TikTok redirige parfois en plusieurs temps :
 * cinq étapes au plus sont suivies, à la main, et uniquement vers des domaines TikTok. Chaque étape est tentée
 * comme un ordinateur puis comme un téléphone, avant de conclure que le lien est mort.
 */
export async function resolveTikTokPost(link: TikTokLink, fetchImpl: typeof fetch = fetch): Promise<TikTokPost> {
  let current = link;
  for (let hop = 0; hop < 5 && current.kind === "short"; hop++) {
    let next: TikTokLink | null = null;
    let answered = false;
    for (const agent of BROWSERS) {
      let res: Response;
      try {
        res = await fetchImpl(current.url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000), cache: "no-store", headers: { "User-Agent": agent, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8", Accept: "text/html,*/*;q=0.8" } });
      } catch {
        continue;
      }
      answered = true;
      const location = res.headers.get("location");
      let found: TikTokLink | Unrecognised | null = null;
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => undefined);
        try {
          found = classify(new URL(location, current.url));
        } catch {
          found = null;
        }
      } else if (res.ok) {
        found = postDeclaredBy(await readStart(res, 400_000).catch(() => ""));
      } else {
        await res.body?.cancel().catch(() => undefined);
      }
      if (found && found.kind !== "none") {
        next = found;
        break;
      }
    }
    if (!next) throw answered ? new ApiError("LINK_DEAD", LINK_DEAD) : new ApiError("UPSTREAM_ERROR");
    current = next;
  }
  if (current.kind === "short") throw new ApiError("LINK_DEAD", LINK_DEAD);
  return current;
}

/** Comme `resolveTikTokPost`, pour le mode vidéo : un carrousel de photos est renvoyé vers le mode Bannières. */
export async function resolveTikTokLink(link: TikTokLink, fetchImpl: typeof fetch = fetch): Promise<TikTokPost & { kind: "video" }> {
  const found = await resolveTikTokPost(link, fetchImpl);
  if (found.kind !== "video") throw Object.assign(new ApiError("UNSUPPORTED_URL", "Ce lien mène à un carrousel de photos, pas à une vidéo."), { reason: "photo" });
  return found as TikTokPost & { kind: "video" };
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

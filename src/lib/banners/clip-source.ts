import { BannerError } from "./errors";
import { fetchBytes } from "./http";
import type { PostLink } from "./link";

/**
 * Source n° 2 (facultative, remplaçable) : les clips animés des « Live Photos ».
 *
 *   - clips[i]  : adresse du clip de la bannière i, ou null si elle n'en a pas ;
 *   - images[i] : adresses de l'image de la bannière i (secours si la page publique échoue).
 * Une source lève une BannerError ; l'appelant continue alors avec les images seules.
 */
export type ClipSource = { name: string; fetchClips(link: PostLink): Promise<{ clips: (string | null)[]; images: string[][] }> };

/**
 * TikWM est un service tiers NON OFFICIEL, sans lien avec TikTok.
 * Seule donnée transmise : l'adresse canonique de la publication (plus l'adresse IP du serveur, inévitable).
 * Rien de ce qui identifie le visiteur ne lui est envoyé.
 */
function tikwm({ apiUrl, apiKey, timeoutMs }: { apiUrl: string; apiKey?: string; timeoutMs: number }): ClipSource {
  // L'accès gratuit est limité à environ une requête par seconde : les appels sont mis en file.
  let queue: Promise<unknown> = Promise.resolve();
  let last = 0;
  const call = async (link: PostLink) => {
    const url = new URL(apiUrl);
    url.searchParams.set("url", link.canonical);
    let res;
    try {
      res = await fetchBytes(url, { timeoutMs, maxBytes: 2_000_000, headers: apiKey ? { "x-api-key": apiKey } : {} });
    } catch (e) {
      const code = e instanceof BannerError ? e.code : "";
      throw new BannerError(code === "TIMEOUT" ? "CLIPS_TIMEOUT" : code === "TOO_LARGE" ? "CLIPS_FORMAT" : "CLIPS_UNREACHABLE", "Le service de clips n'a pas répondu.", 502);
    }
    const detail = (text: string) => `HTTP ${res.status} ${res.headers.get("content-type") ?? ""} ${text.replace(/\s+/g, " ").slice(0, 100)}`.trim();
    const fail = (code: string, message: string, text = "") => Object.assign(new BannerError(code, message, 502), { detail: detail(text) });
    const raw = res.body.toString("utf8");
    if (res.status === 429) throw fail("CLIPS_QUOTA", "Le service de clips a atteint sa limite d'utilisation.");
    if (res.status !== 200) throw fail("CLIPS_ERROR", `Le service de clips a répondu par une erreur (${res.status}).`, raw);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- réponse externe, vérifiée champ par champ
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      throw fail("CLIPS_FORMAT", "Réponse illisible du service de clips.", raw);
    }
    if (body?.code !== 0 || typeof body.data !== "object" || !body.data) {
      const quota = /limit|quota|frequen/i.test(String(body?.msg ?? ""));
      throw fail(quota ? "CLIPS_QUOTA" : "CLIPS_REFUSED", "Le service de clips n'a pas pu traiter cette publication.", String(body?.msg ?? ""));
    }
    if (String(body.data.id) !== link.id) throw new BannerError("CLIPS_FORMAT", "Le service de clips a renvoyé une autre publication.", 502);
    const text = (v: unknown) => (typeof v === "string" && v.startsWith("https://") ? v : null);
    const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
    return { clips: list(body.data.live_images).map(text), images: list(body.data.images).map((u) => (text(u) ? [u as string] : [])) };
  };
  return {
    name: "tikwm",
    async fetchClips(link) {
      const turn = queue.then(async () => {
        for (let attempt = 0; ; attempt++) {
          const wait = last + 1100 - Date.now();
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          last = Date.now();
          try {
            return await call(link);
          } catch (e) {
            // Une limite de débit passagère mérite un second essai ; toute autre erreur est définitive.
            if (attempt >= 1 || !(e instanceof BannerError) || e.code !== "CLIPS_QUOTA") throw e;
          }
        }
      });
      queue = turn.catch(() => undefined);
      return turn;
    },
  };
}

/** Choisit la source de clips d'après la configuration. `none` = images seules. */
export function createClipSource(env: Record<string, string | undefined> = process.env): ClipSource | null {
  const kind = (env.BANNER_CLIP_SOURCE ?? "tikwm").toLowerCase();
  if (kind === "none") return null;
  return tikwm({ apiUrl: env.TIKWM_API_URL || "https://www.tikwm.com/api/", apiKey: env.TIKWM_API_KEY || undefined, timeoutMs: Number(env.BANNER_CLIP_TIMEOUT_MS) || 12000 });
}

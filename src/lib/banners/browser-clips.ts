import type { BannerSet } from "./types";

/**
 * Repli côté navigateur. Le service tiers d'animations (TikWM) refuse certaines adresses de serveurs, dont celles de
 * notre hébergeur, mais accepte les navigateurs (il autorise explicitement les appels depuis d'autres sites).
 * Le navigateur lui demande donc la liste des animations, puis la remet à notre serveur, qui la contrôle
 * (serveurs de fichiers TikTok uniquement) et télécharge les fichiers. En cas d'échec, les images restent proposées.
 */
export async function completeInBrowser(set: BannerSet, signal: AbortSignal): Promise<BannerSet> {
  const fallback = set.clipFallback;
  if (!fallback) return set;
  try {
    let clips: (string | null)[] | null = null;
    for (let attempt = 0; attempt < 2 && !clips; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 1300)); // limite gratuite : une requête par seconde
      const res = await fetch(`${fallback.api}?url=${encodeURIComponent(fallback.url)}`, { signal, referrerPolicy: "no-referrer", credentials: "omit", cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { code?: number; data?: { id?: unknown; live_images?: unknown } } | null;
      if (body?.code !== 0 || !body.data) continue;
      if (String(body.data.id) !== set.postId) return set;
      const list = Array.isArray(body.data.live_images) ? body.data.live_images : [];
      clips = list.map((c) => (typeof c === "string" && c.startsWith("https://") ? c : null));
    }
    if (!clips) return set;
    // Aucune animation dans la publication : liste de la bonne longueur, entièrement vide.
    if (clips.length === 0) clips = set.items.map(() => null);
    if (clips.length !== set.count) return set;
    const res = await fetch(`/api/banners/${set.id}/clips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clips }), signal });
    const updated = (await res.json().catch(() => null)) as BannerSet | null;
    return res.ok && updated && Array.isArray(updated.items) ? updated : set;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return set;
  }
}

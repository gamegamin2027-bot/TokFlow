import { BannerError } from "./errors";

export const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type Fetched = { status: number; headers: Headers; body: Buffer };

/**
 * Requête sortante bornée en temps ET en taille. Le délai couvre toute la réponse (en-têtes et corps) :
 * un serveur qui envoie ses données au compte-gouttes est coupé comme un serveur muet.
 * Les redirections ne sont jamais suivies automatiquement, sauf demande explicite.
 * `body` est vide si `maxBytes` vaut 0.
 */
export async function fetchBytes(url: string | URL, { timeoutMs = 15000, maxBytes = 0, headers = {}, redirect = "manual" }: { timeoutMs?: number; maxBytes?: number; headers?: Record<string, string>; redirect?: "manual" | "follow" } = {}): Promise<Fetched> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "user-agent": DESKTOP_UA, ...headers }, redirect, signal: controller.signal, cache: "no-store" });
    if (!maxBytes) {
      await res.body?.cancel().catch(() => undefined);
      return { status: res.status, headers: res.headers, body: Buffer.alloc(0) };
    }
    const tooLarge = () => {
      controller.abort();
      return new BannerError("TOO_LARGE", "Le fichier distant dépasse la taille autorisée.", 502);
    };
    if (Number(res.headers.get("content-length")) > maxBytes) throw tooLarge();
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw tooLarge();
      chunks.push(value);
    }
    return { status: res.status, headers: res.headers, body: Buffer.concat(chunks) };
  } catch (e) {
    if (e instanceof BannerError) throw e;
    throw new BannerError(controller.signal.aborted ? "TIMEOUT" : "UNREACHABLE", "Le serveur distant n'a pas répondu.", 502);
  } finally {
    clearTimeout(timer);
  }
}

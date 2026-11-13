import type { ApiErrorBody } from "./types";

export type DownloadPhase = { state: "preparing" } | { state: "downloading"; received: number; total: number } | { state: "saved"; fileName: string; size: number };

export class DownloadError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

/**
 * Lance un traitement serveur, suit la progression du transfert puis
 * enregistre le fichier sur l'appareil.
 */
export async function requestFile(input: string, init: RequestInit, onPhase: (p: DownloadPhase) => void, signal: AbortSignal): Promise<void> {
  onPhase({ state: "preparing" });
  let res: Response;
  try {
    res = await fetch(input, { ...init, signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new DownloadError("Connexion au serveur impossible. Vérifiez votre réseau et réessayez.", "NETWORK");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new DownloadError(body?.error?.message ?? `Le serveur a répondu avec une erreur (${res.status}).`, body?.error?.code ?? "HTTP");
  }

  const total = Number(res.headers.get("content-length") ?? 0);
  const fileName = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "tokflow";
  const type = res.headers.get("content-type") ?? "application/octet-stream";

  const chunks: BlobPart[] = [];
  let received = 0;
  const reader = res.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onPhase({ state: "downloading", received, total });
  }

  const href = URL.createObjectURL(new Blob(chunks, { type }));
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
  onPhase({ state: "saved", fileName, size: received });
}

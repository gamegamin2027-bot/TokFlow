import type { ApiErrorBody } from "./types";

export type DownloadPhase = { state: "preparing" } | { state: "downloading"; received: number; total: number } | { state: "saved"; fileName: string; size: number };

export class DownloadError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

/** Nom de fichier annoncé par le serveur : la forme UTF-8 (accents) est préférée à la forme ASCII. */
export function fileNameFrom(header: string | null): string | undefined {
  if (!header) return undefined;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      /* forme invalide : on retombe sur le nom ASCII */
    }
  }
  return header.match(/filename="([^"]+)"/)?.[1];
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
  const fileName = fileNameFrom(res.headers.get("content-disposition")) ?? "tokflow";
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

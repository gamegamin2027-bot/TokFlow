/**
 * Pont avec l'application TokFlow (Android). Dans l'application, le site est affiché sans navigateur :
 * l'enregistrement des fichiers et la lecture du presse-papiers passent par elle.
 * L'application n'expose ce pont qu'aux pages du site, jamais aux cadres d'un autre domaine.
 */
type Port = { postMessage(message: string): void; onmessage: ((event: { data: string }) => void) | null };
type Reply = { id: number; ok: boolean; text?: string; error?: string };

const CHUNK_BYTES = 3 * 128 * 1024; // multiple de 3 : chaque morceau se code en base64 sans bourrage intermédiaire

let nextId = 1;
const waiting = new Map<number, (reply: Reply) => void>();

function port(): Port | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { TokFlowApp?: Port }).TokFlowApp;
  if (!candidate || typeof candidate.postMessage !== "function") return null;
  if (!candidate.onmessage) {
    candidate.onmessage = (event) => {
      try {
        const reply = JSON.parse(event.data) as Reply;
        waiting.get(reply.id)?.(reply);
        waiting.delete(reply.id);
      } catch {
        /* message illisible : ignoré */
      }
    };
  }
  return candidate;
}

export const insideApp = () => port() !== null;

function ask(message: Record<string, unknown>): Promise<Reply> {
  const p = port();
  if (!p) return Promise.reject(new Error("no app"));
  const id = nextId++;
  return new Promise<Reply>((resolve) => {
    waiting.set(id, resolve);
    p.postMessage(JSON.stringify({ ...message, id }));
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Texte du presse-papiers, lu par l'application. */
export async function clipboardFromApp(): Promise<string> {
  const reply = await ask({ type: "clipboard" });
  return reply.text ?? "";
}

/** Remet un fichier à l'application, par morceaux ; elle l'enregistre dans la galerie ou les téléchargements. */
export async function saveThroughApp(blob: Blob, fileName: string, signal?: AbortSignal): Promise<void> {
  const begin = await ask({ type: "begin", name: fileName, mime: blob.type, size: blob.size });
  if (!begin.ok) throw new Error(begin.error ?? "save");
  const file = begin.text;
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    if (signal?.aborted) {
      void ask({ type: "cancel", file });
      throw new DOMException("Aborted", "AbortError");
    }
    const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
    const sent = await ask({ type: "chunk", file, data: toBase64(bytes) });
    if (!sent.ok) throw new Error(sent.error ?? "save");
  }
  const done = await ask({ type: "finish", file });
  if (!done.ok) throw new Error(done.error ?? "save");
}

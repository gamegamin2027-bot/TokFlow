import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { config } from "../config";
import { ApiError } from "../errors";
import { contentDisposition } from "./formats";

// État partagé par toutes les routes (un seul compteur, même si le module est chargé plusieurs fois).
const state = ((globalThis as { __tokflowJobs?: { active: number } }).__tokflowJobs ??= { active: 0 });

/** Réserve un emplacement de traitement ; lève BUSY si la capacité est atteinte. */
export function acquireJob(): () => void {
  if (state.active >= config.maxConcurrentJobs) throw new ApiError("BUSY", undefined, { "Retry-After": "10" });
  state.active += 1;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      state.active -= 1;
    }
  };
}

/** Comme `acquireJob`, mais patiente (file d'attente) au lieu d'échouer tout de suite. */
export async function waitForJob(maxWaitMs = 120_000): Promise<() => void> {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    try {
      return acquireJob();
    } catch (e) {
      if (Date.now() >= deadline) throw e;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

export async function createWorkDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "tokflow-"));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => undefined) };
}

/**
 * Diffuse un fichier en téléchargement puis exécute `onDone`
 * (nettoyage) une fois le flux terminé ou interrompu.
 */
export async function fileDownloadResponse(path: string, fileName: string, contentType: string, onDone: () => void = () => undefined): Promise<Response> {
  const { size } = await stat(path);
  const stream = createReadStream(path);
  let done = false;
  const finish = () => {
    if (!done) {
      done = true;
      onDone();
    }
  };
  stream.on("close", finish);
  stream.on("error", finish);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Content-Disposition": contentDisposition(fileName),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Diffuse un fichier en lecture (aperçu vidéo), avec prise en charge des requêtes partielles (Range). */
export async function fileRangeResponse(path: string, req: Request, contentType: string): Promise<Response> {
  const { size } = await stat(path);
  const headers: Record<string, string> = { "Content-Type": contentType, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" };
  const m = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) {
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, {
    status: 206,
    headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
  });
}

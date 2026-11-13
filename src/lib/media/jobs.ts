import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { config } from "../config";
import { ApiError } from "../errors";

let active = 0;

/** Réserve un emplacement de traitement ; lève BUSY si la capacité est atteinte. */
export function acquireJob(): () => void {
  if (active >= config.maxConcurrentJobs) throw new ApiError("BUSY", undefined, { "Retry-After": "10" });
  active += 1;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      active -= 1;
    }
  };
}

export async function createWorkDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "tokflow-"));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => undefined) };
}

/**
 * Diffuse un fichier en téléchargement puis exécute `onDone`
 * (nettoyage) une fois le flux terminé ou interrompu.
 */
export async function fileDownloadResponse(path: string, fileName: string, contentType: string, onDone: () => void): Promise<Response> {
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
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

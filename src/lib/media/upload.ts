import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "../config";
import { ApiError } from "../errors";

const tooLarge = () => new ApiError("FILE_TOO_LARGE", `Fichier trop volumineux (maximum ${Math.round(config.maxUploadBytes / 1024 / 1024)} Mo).`);

/** Vérifie la taille annoncée avant de réserver quoi que ce soit. */
export function assertUploadAllowed(req: Request): void {
  if (Number(req.headers.get("content-length") ?? 0) > config.maxUploadBytes) throw tooLarge();
  if (!req.body) throw new ApiError("INVALID_REQUEST", "Aucun fichier reçu.");
}

/** Écrit le corps brut de la requête dans `path`, en coupant dès que la taille maximale est dépassée. */
export async function receiveUpload(req: Request, path: string): Promise<number> {
  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      cb(received > config.maxUploadBytes ? tooLarge() : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]), limiter, createWriteStream(path));
  } catch (e) {
    throw e instanceof ApiError ? e : new ApiError("INVALID_REQUEST", "Le transfert du fichier a été interrompu.");
  }
  if (received === 0) throw new ApiError("INVALID_REQUEST", "Aucun fichier reçu.");
  return received;
}

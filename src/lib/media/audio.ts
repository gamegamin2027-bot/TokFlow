import type { Mp3Bitrate } from "./formats";
import type { ProbeResult } from "./ffmpeg";

/** Traitement « Audio » : extraction de la piste son d'une vidéo. */

const BASE = ["-hide_banner", "-nostdin", "-y"];

export function mp3Args(input: string, output: string, bitrate: Mp3Bitrate): string[] {
  return [...BASE, "-i", input, "-vn", "-map", "0:a:0", "-c:a", "libmp3lame", "-b:a", `${bitrate}k`, "-ar", "44100", "-map_metadata", "-1", "-f", "mp3", output];
}

/** Le son d'origine peut-il être placé tel quel dans un M4A (aucune perte de qualité) ? */
export const canCopyToM4a = (info: Pick<ProbeResult, "audioCodec">) => info.audioCodec === "aac";

/**
 * M4A : si la source est déjà en AAC (cas de TikTok), la piste est copiée sans ré-encodage,
 * donc strictement identique à l'original. Sinon elle est encodée en AAC 192 kb/s.
 */
export function m4aArgs(input: string, output: string, copy: boolean): string[] {
  const codec = copy ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "192k"];
  return [...BASE, "-i", input, "-vn", "-map", "0:a:0", ...codec, "-map_metadata", "-1", "-movflags", "+faststart", "-f", "ipod", output];
}

export const AUDIO_MIME = { mp3: "audio/mpeg", m4a: "audio/mp4" } as const;

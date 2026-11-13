import { convert, type ProbeResult } from "../ffmpeg";
import type { FrameScan } from "./frames";

/** Découpe d'une séquence en fichier vidéo indépendant, et vignettes. */

const BASE = ["-hide_banner", "-nostdin", "-y"];
const EPS = 1e-4;

export type ClipMode = "copy" | "encode";

/** Indices [première image, image suivant la dernière[ couverts par l'intervalle. */
export function frameRange(times: number[], start: number, end: number): [number, number] {
  let a = 0;
  while (a < times.length && times[a] < start - EPS) a++;
  let b = a;
  while (b < times.length && times[b] < end - EPS) b++;
  return [a, b];
}

/**
 * La copie sans ré-encodage n'est exacte que si la séquence commence sur une image clé ET se
 * termine juste avant une autre image clé (ou à la fin de la vidéo) : sinon des images de la
 * séquence voisine se glisseraient dans le fichier. Réservée au H.264, lisible partout.
 */
export function canCopy(scan: Pick<FrameScan, "times" | "keyframes">, info: Pick<ProbeResult, "videoCodec">, start: number, end: number): boolean {
  if (info.videoCodec !== "h264") return false;
  const [a, b] = frameRange(scan.times, start, end);
  if (b <= a) return false;
  const isKey = (t: number) => scan.keyframes.some((k) => Math.abs(k - t) < 1e-3);
  return isKey(scan.times[a]) && (b >= scan.times.length || isKey(scan.times[b]));
}

export function copyArgs(input: string, output: string, times: number[], start: number, end: number): string[] {
  const [a, b] = frameRange(times, start, end);
  const first = times[a];
  const lastEnd = b < times.length ? (times[b - 1] + times[b]) / 2 : end;
  // `-frames:v` borne la vidéo au nombre exact d'images ; `-t` borne le son.
  return [...BASE, "-ss", (first + 0.002).toFixed(4), "-i", input, "-t", Math.max(0.01, lastEnd - first).toFixed(4), "-frames:v", String(b - a), "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-map_metadata", "-1", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", "-f", "mp4", output];
}

export function encodeArgs(input: string, output: string, times: number[], start: number, end: number): string[] {
  const [a, b] = frameRange(times, start, end);
  // Départ calé sur la première image voulue (pas d'image dupliquée ni manquante en tête),
  // arrêt juste avant la première image de la séquence suivante.
  const first = b > a ? times[a] : start;
  const stop = b > a && b < times.length ? times[b] : end;
  const count = b > a ? ["-frames:v", String(b - a)] : [];
  return [...BASE, "-ss", Math.max(0, first - 0.0005).toFixed(4), "-i", input, "-t", Math.max(0.05, stop - first - 0.001).toFixed(4), ...count, "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-map_metadata", "-1", "-movflags", "+faststart", "-threads", "2", "-f", "mp4", output];
}

/** Nombre d'images réellement décodables d'un fichier (lecture complète de la piste vidéo). */
export async function countFrames(file: string): Promise<number | undefined> {
  const log = await convert([...BASE.slice(0, 2), "-i", file, "-map", "0:v:0", "-fps_mode", "passthrough", "-f", "null", "-"]);
  const all = [...log.matchAll(/frame=\s*(\d+)/g)];
  return all.length ? Number(all[all.length - 1][1]) : undefined;
}

/**
 * Extrait la séquence [start, end[ dans `output`.
 * Copie directe quand elle est exacte à l'image près (vérifiée après coup) ; sinon ré-encodage.
 */
export async function extractClip(input: string, output: string, scan: FrameScan, info: ProbeResult, start: number, end: number): Promise<ClipMode> {
  if (canCopy(scan, info, start, end)) {
    const [a, b] = frameRange(scan.times, start, end);
    try {
      await convert(copyArgs(input, output, scan.times, start, end));
      if ((await countFrames(output)) === b - a) return "copy";
    } catch {
      /* la copie a échoué : on ré-encode */
    }
  }
  await convert(encodeArgs(input, output, scan.times, start, end));
  return "encode";
}

export function thumbnailArgs(input: string, output: string, at: number): string[] {
  return [...BASE, "-ss", Math.max(0, at).toFixed(3), "-i", input, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "5", "-f", "image2", output];
}

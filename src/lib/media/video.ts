import type { Mp4Target } from "./formats";

/** Traitement « Vidéo » : vidéo complète, d'origine ou redimensionnée. */

export function mp4Args(input: string, output: string, target: Mp4Target): string[] {
  const base = ["-hide_banner", "-nostdin", "-y", "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1"];
  if (target === "source") {
    return [...base, "-c", "copy", "-movflags", "+faststart", "-f", "mp4", output];
  }
  // Redimensionne le petit côté vers la cible, sans jamais agrandir, dimensions paires.
  const scale = `scale='if(gt(iw,ih),-2,min(${target},iw))':'if(gt(iw,ih),min(${target},ih),-2)'`;
  return [...base, "-vf", scale, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-threads", "2", "-f", "mp4", output];
}

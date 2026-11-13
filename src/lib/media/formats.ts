/** Définitions de formats partagées entre le client et le serveur. */
export type OutputFormat = "mp4" | "mp3" | "m4a";
export type AudioFormat = "mp3" | "m4a";

export function isOutputFormat(v: unknown): v is OutputFormat {
  return v === "mp4" || v === "mp3" || v === "m4a";
}

export const MP3_BITRATES = [320, 192, 128] as const;
export type Mp3Bitrate = (typeof MP3_BITRATES)[number];

/** Hauteurs cibles (petit côté) proposées pour le ré-encodage d'un fichier importé. */
export const MP4_TARGETS = [1080, 720, 480] as const;
export type Mp4Target = (typeof MP4_TARGETS)[number] | "source";

export function isMp3Bitrate(v: unknown): v is Mp3Bitrate {
  return typeof v === "number" && (MP3_BITRATES as readonly number[]).includes(v);
}

export function parseMp4Target(v: string | null | undefined): Mp4Target | null {
  if (!v || v === "source") return "source";
  const n = Number(v);
  return (MP4_TARGETS as readonly number[]).includes(n) ? (n as Mp4Target) : null;
}

/** Cibles de ré-encodage strictement inférieures à la définition source. */
export function availableTargets(shortSide: number | undefined): Mp4Target[] {
  const lower = shortSide ? MP4_TARGETS.filter((t) => t < shortSide) : [...MP4_TARGETS];
  return ["source", ...lower];
}

export function safeFileName(base: string | undefined, ext: string): string {
  const cleaned = (base ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._ -]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return `${cleaned || "tokflow"}.${ext}`;
}

/** En-tête de téléchargement : nom ASCII de secours + nom exact (accents) pour les navigateurs récents. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._ -]+/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Configuration centralisée, lue depuis les variables d'environnement.
 * Aucune valeur sensible n'est codée en dur.
 */
function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parseProxy(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    if (!["http:", "https:", "socks5:", "socks5h:"].includes(u.protocol) || !u.hostname) throw new Error();
    return value;
  } catch {
    console.error("[tokflow] TOKFLOW_PROXY_URL ignorée : format attendu http(s)://utilisateur:motdepasse@hôte:port ou socks5://…");
    return null;
  }
}

export const config = {
  /** Binaire FFmpeg (présent dans l'image Docker). */
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  /**
   * Moteur de récupération des vidéos publiques par lien.
   * "ytdlp" (défaut) : lit les flux publics tels que servis par TikTok, sans
   * compte, sans cookies et sans contournement de restriction d'accès.
   * "none" : désactive la récupération par lien (conversion de fichiers seule).
   */
  linkEngine: process.env.TOKFLOW_LINK_ENGINE === "none" ? ("none" as const) : ("ytdlp" as const),
  ytdlpPath: process.env.YTDLP_PATH || "yt-dlp",
  /** Proxy sortant facultatif du moteur (http, https, socks5). Vide = connexion directe. */
  proxyUrl: parseProxy(process.env.TOKFLOW_PROXY_URL),
  /** Port SOCKS du relais Tor embarqué (défini par docker-entrypoint.sh). Ignoré si un proxy est configuré. */
  torPort: int("TOKFLOW_TOR_PORT", 0),
  maxUploadBytes: int("MAX_UPLOAD_MB", 200) * 1024 * 1024,
  maxDurationSeconds: int("MAX_DURATION_SECONDS", 900),
  maxConcurrentJobs: int("MAX_CONCURRENT_JOBS", 2),
  jobTimeoutMs: int("JOB_TIMEOUT_SECONDS", 180) * 1000,
  rateLimit: {
    analyzePerMinute: int("RATE_LIMIT_ANALYZE_PER_MIN", 30),
    jobsPerTenMinutes: int("RATE_LIMIT_JOBS_PER_10MIN", 15),
    /** Mode Bannières : analyses, archives et fichiers, par visiteur. */
    bannersPerTenMinutes: int("RATE_LIMIT_BANNERS_PER_10MIN", 12),
    bannerZipsPerTenMinutes: int("RATE_LIMIT_BANNER_ZIPS_PER_10MIN", 20),
    bannerFilesPerTenMinutes: int("RATE_LIMIT_BANNER_FILES_PER_10MIN", 900),
  },
};

export const linkDownloadEnabled = () => config.linkEngine !== "none";

/** Types partagés entre le serveur et l'interface pour le mode « Bannières ». */
export type BannerSegment = { index: number; start: number; end: number };
export type BannerSensitivity = "low" | "normal" | "high";
export type BannerVerdict = "banners" | "single" | "uncertain";

export type BannerExportView = {
  id: string;
  status: "running" | "ready" | "error";
  total: number;
  done: number;
  /** Fichier en cours d'extraction. */
  current?: string;
  errors: { name: string; message: string }[];
  fileName: string;
  size?: number;
};

export type BannerJobView = {
  id: string;
  status: "downloading" | "analysing" | "ready" | "error";
  /** Avancement de l'étape en cours, de 0 à 1. */
  progress: number;
  error?: { code: string; message: string };
  label: string;
  expiresAt: number;
  sensitivity: BannerSensitivity;
  duration?: number;
  width?: number;
  height?: number;
  verdict?: BannerVerdict;
  reason?: string;
  segments: BannerSegment[];
  export?: BannerExportView;
};

import type { LinkQuality } from "./media/link-engine";

export type AnalyzeResult = {
  id: string;
  url: string;
  username: string;
  title?: string;
  authorName?: string;
  thumbnail?: string;
  playerUrl: string;
  durationSeconds?: number;
  /** Le téléchargement direct depuis le lien est-il possible pour ce contenu ? */
  linkDownload: boolean;
  /** Raison lisible lorsque `linkDownload` est faux. */
  linkUnavailableReason?: string;
  /** Qualités du flux d'origine, sans filigrane incrusté. */
  qualities: LinkQuality[];
};

export type ApiErrorBody = { error: { code: string; message: string } };

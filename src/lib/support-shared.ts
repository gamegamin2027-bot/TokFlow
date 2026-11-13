/** Constantes du support partagées entre le client et le serveur. */
export const CATEGORIES = [
  { id: "video-download", label: "Problème de téléchargement vidéo" },
  { id: "audio-download", label: "Problème de téléchargement audio" },
  { id: "link-refused", label: "Lien TikTok refusé" },
  { id: "video-unavailable", label: "Vidéo indisponible" },
  { id: "quality", label: "Problème de qualité" },
  { id: "technical", label: "Erreur technique" },
  { id: "suggestion", label: "Suggestion d'amélioration" },
  { id: "feature", label: "Demande de fonctionnalité" },
  { id: "partnership", label: "Partenariat" },
  { id: "other", label: "Autre demande" },
] as const;

export const STATUSES = [
  { id: "new", label: "Nouveau" },
  { id: "in_progress", label: "En cours" },
  { id: "waiting", label: "En attente de réponse" },
  { id: "resolved", label: "Résolu" },
  { id: "closed", label: "Fermé" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export type StatusId = (typeof STATUSES)[number]["id"];

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? id;
export const isStatus = (v: unknown): v is StatusId => STATUSES.some((s) => s.id === v);
export const isCategory = (v: unknown): v is CategoryId => CATEGORIES.some((c) => c.id === v);

export const LIMITS = { subject: 140, description: 5000, descriptionMin: 20, replyMessage: 10_000 };

export type Ticket = {
  id: string;
  category: string;
  email: string;
  tiktokUrl: string | null;
  subject: string;
  description: string;
  status: StatusId;
  createdAt: string;
  updatedAt: string;
};

export type TicketEvent =
  | { id: number; type: "created"; createdAt: string; data: Record<string, never> }
  | { id: number; type: "status_changed"; createdAt: string; data: { from: StatusId; to: StatusId } }
  | { id: number; type: "reply_sent"; createdAt: string; data: { to: string; subject: string; message: string; providerId?: string } };

export type TicketList = { tickets: Ticket[]; counts: Record<StatusId, number>; total: number };

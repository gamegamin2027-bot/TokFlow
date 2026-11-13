import { NextResponse } from "next/server";

export type ErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_URL"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "RATE_LIMITED"
  | "BUSY"
  | "LINK_DOWNLOAD_DISABLED"
  | "INVALID_REQUEST"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MEDIA"
  | "TOO_LONG"
  | "CONVERSION_FAILED"
  | "TIMEOUT"
  | "INTERNAL";

const defaults: Record<ErrorCode, { status: number; message: string }> = {
  INVALID_URL: { status: 400, message: "Ce lien n'est pas une URL valide." },
  UNSUPPORTED_URL: { status: 400, message: "Ce lien n'est pas un lien de vidéo TikTok pris en charge." },
  NOT_FOUND: { status: 404, message: "Cette vidéo n'est pas accessible publiquement : elle est peut-être privée, supprimée, réservée aux abonnés ou restreinte dans certaines régions." },
  UPSTREAM_ERROR: { status: 502, message: "TikTok n'a pas répondu correctement. Réessayez dans un instant." },
  RATE_LIMITED: { status: 429, message: "Trop de requêtes. Patientez un instant avant de réessayer." },
  BUSY: { status: 503, message: "Le service traite déjà plusieurs fichiers. Réessayez dans quelques secondes." },
  LINK_DOWNLOAD_DISABLED: { status: 403, message: "Le téléchargement par lien n'est pas activé sur cette instance." },
  INVALID_REQUEST: { status: 400, message: "Requête invalide." },
  FILE_TOO_LARGE: { status: 413, message: "Fichier trop volumineux." },
  UNSUPPORTED_MEDIA: { status: 415, message: "Ce fichier n'est pas une vidéo ou un audio exploitable." },
  TOO_LONG: { status: 413, message: "Ce contenu dépasse la durée maximale autorisée." },
  CONVERSION_FAILED: { status: 500, message: "La conversion a échoué." },
  TIMEOUT: { status: 504, message: "Le traitement a pris trop de temps et a été interrompu." },
  INTERNAL: { status: 500, message: "Une erreur inattendue est survenue." },
};

export class ApiError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message?: string, readonly headers?: Record<string, string>) {
    super(message ?? defaults[code].message);
    this.status = defaults[code].status;
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status, headers: { "Cache-Control": "no-store", ...err.headers } },
    );
  }
  console.error("[tokflow] unexpected error:", err);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: defaults.INTERNAL.message } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

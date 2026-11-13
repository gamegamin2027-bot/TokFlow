/** Erreur du mode Bannières destinée à l'utilisateur : code stable, message clair, statut HTTP. */
export class BannerError extends Error {
  retryAfter?: number;
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
  }
}

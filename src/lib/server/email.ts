import { ApiError } from "../errors";

/**
 * Envoi d'e-mails via Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Variables : RESEND_API_KEY, EMAIL_FROM (ex. "TokFlow <support@votre-domaine.fr>"),
 * et, facultatif, EMAIL_REPLY_TO. Sans ces variables, aucun envoi n'est tenté.
 */
export const EMAIL_ENV = ["RESEND_API_KEY", "EMAIL_FROM"] as const;

export function emailStatus(): { configured: boolean; missing: string[]; from: string | null } {
  const missing = EMAIL_ENV.filter((k) => !process.env[k]?.trim());
  return { configured: missing.length === 0, missing, from: process.env.EMAIL_FROM?.trim() || null };
}

export async function sendEmail(mail: { to: string; subject: string; text: string }): Promise<{ id?: string }> {
  const status = emailStatus();
  if (!status.configured) throw new ApiError("EMAIL_NOT_CONFIGURED", `L'envoi d'e-mails n'est pas configuré. Variables manquantes : ${status.missing.join(", ")}.`);

  const endpoint = process.env.RESEND_API_URL?.trim() || "https://api.resend.com/emails";
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: status.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(process.env.EMAIL_REPLY_TO?.trim() ? { reply_to: process.env.EMAIL_REPLY_TO.trim() } : {}),
      }),
    });
  } catch {
    throw new ApiError("EMAIL_FAILED", "Le fournisseur d'e-mails est injoignable. Le message n'a pas été envoyé.");
  }
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok) {
    console.error("[tokflow] resend:", res.status, body?.message);
    throw new ApiError("EMAIL_FAILED", `Le fournisseur d'e-mails a refusé l'envoi${body?.message ? ` : ${String(body.message).slice(0, 200)}` : ` (code ${res.status})`}. Le message n'a pas été envoyé.`);
  }
  return { id: body?.id };
}

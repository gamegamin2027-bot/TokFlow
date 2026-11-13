import { NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/errors";
import { assertSameOrigin, requireFounder } from "@/lib/server/auth";
import { sendEmail } from "@/lib/server/email";
import { getTicket, recordReply } from "@/lib/server/support";
import { LIMITS } from "@/lib/support-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Envoie une réponse par e-mail au demandeur. L'historique n'est écrit qu'après un envoi accepté par le fournisseur. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    await requireFounder();
    const { id } = await params;
    const { ticket } = await getTicket(id);

    const body = (await req.json().catch(() => null)) as { subject?: unknown; message?: unknown } | null;
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const fields: Record<string, string> = {};
    if (!subject) fields.subject = "Le sujet est obligatoire.";
    else if (subject.length > 200) fields.subject = "200 caractères maximum.";
    if (!message) fields.message = "Le message est obligatoire.";
    else if (message.length > LIMITS.replyMessage) fields.message = `${LIMITS.replyMessage} caractères maximum.`;
    if (Object.keys(fields).length) {
      const err = new ApiError("VALIDATION", "Vérifiez les champs signalés.");
      err.fields = fields;
      throw err;
    }

    const sent = await sendEmail({ to: ticket.email, subject, text: message });
    await recordReply(id, { to: ticket.email, subject, message, providerId: sent.id });
    return NextResponse.json(await getTicket(id), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

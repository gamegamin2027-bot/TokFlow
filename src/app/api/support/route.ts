import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/server/auth";
import { createTicket, validateTicketInput } from "@/lib/server/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enregistre une demande d'assistance. La confirmation n'est renvoyée qu'après écriture en base. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    checkRateLimit(`support:${clientIp(req)}`, Number(process.env.RATE_LIMIT_SUPPORT_PER_HOUR) || 5, 3_600_000);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    // Champ piège invisible : rempli uniquement par les robots.
    if (typeof body?.website === "string" && body.website) return NextResponse.json({ error: { code: "VALIDATION", message: "Requête refusée." } }, { status: 422 });
    const ticket = await createTicket(validateTicketInput(body));
    return NextResponse.json({ id: ticket.id, createdAt: ticket.createdAt }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

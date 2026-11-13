import { NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/errors";
import { assertSameOrigin, requireFounder } from "@/lib/server/auth";
import { getTicket, setTicketStatus } from "@/lib/server/support";
import { isStatus } from "@/lib/support-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    await requireFounder();
    return NextResponse.json(await getTicket((await params).id), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    await requireFounder();
    const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
    if (!isStatus(body?.status)) throw new ApiError("INVALID_REQUEST", "Statut inconnu.");
    const { id } = await params;
    await setTicketStatus(id, body.status);
    return NextResponse.json(await getTicket(id), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

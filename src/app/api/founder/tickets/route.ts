import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireFounder } from "@/lib/server/auth";
import { emailStatus } from "@/lib/server/email";
import { listTickets } from "@/lib/server/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireFounder();
    const q = new URL(req.url).searchParams;
    const list = await listTickets({ status: q.get("status"), category: q.get("category"), q: q.get("q"), sort: q.get("sort") });
    const email = emailStatus();
    return NextResponse.json({ ...list, email: { configured: email.configured, missing: email.missing, from: email.from } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

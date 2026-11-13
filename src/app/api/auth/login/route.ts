import { NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertSameOrigin, checkFounderLogin, startSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    checkRateLimit(`auth:${clientIp(req)}`, 10, 600_000);
    const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
    if (!(await checkFounderLogin(email, password))) throw new ApiError("UNAUTHORIZED", "E-mail ou mot de passe incorrect.");
    await startSession();
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

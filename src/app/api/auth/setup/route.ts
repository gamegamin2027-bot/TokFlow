import { NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertSameOrigin, createFounder, founderExists, startSession, validateCredentials } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Création du compte fondateur : possible une seule fois, par le premier visiteur. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    checkRateLimit(`auth:${clientIp(req)}`, 10, 600_000);
    if (await founderExists()) throw new ApiError("CONFLICT", "Le compte fondateur existe déjà. L'inscription est fermée.");
    const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
    const { email, password } = validateCredentials(body?.email, body?.password);
    await createFounder(email, password);
    await startSession();
    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

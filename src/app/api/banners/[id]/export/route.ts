import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { errorResponse } from "@/lib/errors";
import { startExport } from "@/lib/media/banners/service";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prépare une archive ZIP avec uniquement les bannières demandées :
 * { items: [{ index, start, end }] }. L'avancement se lit sur GET /api/banners/{id}.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkRateLimit(`file:${clientIp(req)}`, config.rateLimit.filesPerTenMinutes, 600_000);
    const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
    return NextResponse.json(startExport((await params).id, body?.items), { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

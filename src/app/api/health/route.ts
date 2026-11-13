import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok", service: "tokflow", linkEngine: config.linkEngine, uptime: Math.round(process.uptime()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

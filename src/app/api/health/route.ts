import { NextResponse } from "next/server";
import { config, linkDownloadEnabled } from "@/lib/config";
import { linkEngineVersion } from "@/lib/media/link-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "tokflow",
      linkEngine: config.linkEngine,
      linkEngineVersion: linkDownloadEnabled() ? await linkEngineVersion() : null,
      uptime: Math.round(process.uptime()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextResponse } from "next/server";
import { config, linkDownloadEnabled } from "@/lib/config";
import { linkEngineVersion } from "@/lib/media/link-engine";
import { founderExists } from "@/lib/server/auth";
import { databaseConfigured } from "@/lib/server/db";
import { emailStatus } from "@/lib/server/email";

export const dynamic = "force-dynamic";

/** État de la base, sans aucune donnée : "missing" (DATABASE_URL absente), "ok" ou "unreachable". */
async function databaseState() {
  if (!databaseConfigured()) return { database: "missing", founder: null };
  try {
    return { database: "ok", founder: (await founderExists()) ? "created" : "pending" };
  } catch {
    return { database: "unreachable", founder: null };
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "tokflow",
      linkEngine: config.linkEngine,
      linkEngineVersion: linkDownloadEnabled() ? await linkEngineVersion() : null,
      ...(await databaseState()),
      email: emailStatus().configured ? "configured" : "missing",
      uptime: Math.round(process.uptime()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

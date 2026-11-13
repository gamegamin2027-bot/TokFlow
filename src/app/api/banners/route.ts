import { NextResponse } from "next/server";
import { analyseBanners } from "@/lib/banners/service";
import { config } from "@/lib/config";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { bannerError, readSmallJson } from "./respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Analyse une publication : renvoie la liste des bannières, animées ou fixes. */
export async function POST(req: Request) {
  try {
    // Une analyse déclenche des appels sortants : c'est la limite la plus stricte.
    checkRateLimit(`banners:${clientIp(req)}`, config.rateLimit.bannersPerTenMinutes, 600_000);
    const body = await readSmallJson(req);
    const result = await analyseBanners(body.url, { log: (message) => console.warn(`[tokflow] bannières : ${message}`) });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return bannerError(err);
  }
}

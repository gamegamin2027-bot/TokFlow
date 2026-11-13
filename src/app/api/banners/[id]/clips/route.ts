import { NextResponse } from "next/server";
import { attachBannerClips } from "@/lib/banners/service";
import { config } from "@/lib/config";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { bannerError, readSmallJson } from "../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Animations trouvées par le navigateur du visiteur : { clips: (adresse | null)[] }, une entrée par bannière.
 * Seules les adresses des serveurs de fichiers TikTok sont acceptées ; les autres sont ignorées.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkRateLimit(`banner-clips:${clientIp(req)}`, config.rateLimit.bannersPerTenMinutes, 600_000);
    const { id } = await params;
    const body = await readSmallJson(req, 120_000);
    const result = await attachBannerClips(id, body.clips, (message) => console.warn(`[tokflow] bannières (navigateur) : ${message}`));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return bannerError(err);
  }
}

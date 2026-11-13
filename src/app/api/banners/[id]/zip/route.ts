import { getBannerZip } from "@/lib/banners/service";
import { config } from "@/lib/config";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { bannerError, readSmallJson } from "../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Archive ZIP contenant exactement les bannières sélectionnées : { items: [{ n, formats? }] }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkRateLimit(`banner-zip:${clientIp(req)}`, config.rateLimit.bannerZipsPerTenMinutes, 600_000);
    const { id } = await params;
    const body = await readSmallJson(req);
    const zip = await getBannerZip(id, body.items);
    return new Response(new Uint8Array(zip.data), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${zip.name}"`, "Content-Length": String(zip.data.length), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    return bannerError(err);
  }
}

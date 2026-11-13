import { BannerError } from "@/lib/banners/errors";
import { getBannerFile } from "@/lib/banners/service";
import { config } from "@/lib/config";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { bannerError } from "../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fichier d'une bannière : /api/banners/<analyse>/<numéro>.(mp4|jpg)
 * Le visiteur ne fournit jamais d'adresse : seulement l'identifiant d'une analyse et un numéro.
 * `?inline=1` pour l'aperçu ; les lectures partielles sont prises en charge (lecteurs vidéo).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  try {
    checkRateLimit(`banner-file:${clientIp(req)}`, config.rateLimit.bannerFilesPerTenMinutes, 600_000);
    const { id, file: requested } = await params;
    const m = /^(\d{1,2})\.(mp4|jpg)$/.exec(requested);
    if (!m) throw new BannerError("NOT_FOUND", "Fichier inconnu.", 404);
    const file = await getBannerFile(id, Number(m[1]), m[2]);
    const inline = new URL(req.url).searchParams.get("inline") === "1";
    const headers: Record<string, string> = {
      "Content-Type": file.type,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.name}"`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    };
    const size = file.data.length;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      return new Response(new Uint8Array(file.data.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
    }
    return new Response(new Uint8Array(file.data), { headers: { ...headers, "Content-Length": String(size) } });
  } catch (err) {
    return bannerError(err);
  }
}

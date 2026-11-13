import { ApiError } from "./errors";

/**
 * Limiteur à fenêtre fixe, en mémoire. Suffisant pour une instance unique
 * (Render). Pour plusieurs instances, remplacer par Redis derrière la même API.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit) {
    const retry = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new ApiError("RATE_LIMITED", undefined, { "Retry-After": String(retry) });
  }
  bucket.count += 1;
}

export function resetRateLimits(): void {
  buckets.clear();
}

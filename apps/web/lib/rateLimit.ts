import { getSupabaseAdmin } from "./supabaseAdmin";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

/**
 * Fixed-window rate limit, backed by the rate_limits table and its atomic
 * increment_rate_limit function (see supabase/migrations). Fails open (lets
 * the request through) on a database error, since a transient DB hiccup
 * should not take down chat or the phone line - the limit exists to cap
 * cost, not to be a hard security boundary.
 */
export async function checkRateLimit(scope: string, key: string, windowMs: number, limit: number): Promise<RateLimitResult> {
  const supabase = getSupabaseAdmin();
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();

  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_scope: scope,
    p_key: key,
    p_window_start: windowStart,
  });

  if (error) {
    console.error(`rate limit check failed for ${scope}:${key}`, error.message);
    return { allowed: true, count: 0, limit };
  }

  const count = data as number;
  return { allowed: count <= limit, count, limit };
}

/**
 * The client's real IP. On Vercel, x-forwarded-for is set/overwritten by
 * Vercel's own edge network and external IPs are not forwarded, so it is
 * safe to trust directly - see docs/DESIGN_NOTES.md.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  return real ?? "unknown";
}

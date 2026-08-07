import { createAdminClient } from '@/lib/supabase/admin'
import { RateLimitError } from '@/lib/api-error'

export type RateLimitAction = 'chat' | 'process' | 'upload'

interface RateLimitConfig {
  limit: number
  windowMs: number
}

const RATE_LIMITS: Record<RateLimitAction, RateLimitConfig> = {
  chat: { limit: 30, windowMs: 60 * 1000 }, // 30 requests / minute
  process: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 requests / hour
  upload: { limit: 20, windowMs: 24 * 60 * 60 * 1000 }, // 20 uploads / day
}

/**
 * Sliding-window limiter backed by `rate_limit_events`. Always uses the service-role client —
 * RLS on this table grants no user-facing policies (see supabase/rls-policies.sql), so this is
 * the only code path that can read or write it; a user cannot reset their own count by hitting
 * the table directly with their session JWT.
 */
export async function checkRateLimit(userId: string, action: RateLimitAction): Promise<void> {
  const supabaseAdmin = createAdminClient()
  const { limit, windowMs } = RATE_LIMITS[action]
  const windowStart = new Date(Date.now() - windowMs).toISOString()

  const { count } = await supabaseAdmin
    .from('rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('route_key', action)
    .gte('created_at', windowStart)

  if ((count ?? 0) >= limit) {
    // Retry-After uses the full window as a conservative upper bound rather than computing the
    // exact age of the oldest event in the window — simpler, and never tells a caller to retry
    // sooner than is actually safe.
    throw new RateLimitError(`Too many ${action} requests — try again later`, Math.ceil(windowMs / 1000))
  }

  await supabaseAdmin.from('rate_limit_events').insert({ user_id: userId, route_key: action })
}

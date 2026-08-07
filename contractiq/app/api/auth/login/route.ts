import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api-error'
import { loginSchema } from '@/lib/validation/auth'

/**
 * Handles signInWithPassword server-side so the session cookies are set on the response via
 * @supabase/ssr's cookie adapter — the client must POST here instead of calling
 * supabase.auth.signInWithPassword() directly.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) return apiError(422, 'invalid_credentials')

  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error || !data.user) return apiError(401, 'invalid_credentials')

  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } })
}

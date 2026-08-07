import { createClient } from '@/lib/supabase/server'

/** The client must POST here instead of calling supabase.auth.signOut() directly. */
export async function POST() {
  const supabase = createClient()
  await supabase.auth.signOut()
  return new Response(null, { status: 204 })
}

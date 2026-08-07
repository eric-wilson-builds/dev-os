import { createClient } from '@/lib/supabase/server'
import { UnauthorizedError } from '@/lib/api-error'
import type { User } from '@supabase/supabase-js'

export async function requireUser(): Promise<User> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new UnauthorizedError()
  return user
}

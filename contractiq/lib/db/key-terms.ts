import { createClient } from '@/lib/supabase/server'
import { NotFoundError } from '@/lib/api-error'
import type { Database } from '@/types/database'

type KeyTerm = Database['public']['Tables']['key_terms']['Row']

export async function getOwnedTerm(termId: string, userId: string): Promise<KeyTerm> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('key_terms')
    .select('*')
    .eq('id', termId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) throw new NotFoundError()
  return data
}

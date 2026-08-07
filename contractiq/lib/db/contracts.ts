import { createClient } from '@/lib/supabase/server'
import { NotFoundError } from '@/lib/api-error'
import type { Database } from '@/types/database'

type Contract = Database['public']['Tables']['contracts']['Row']

/**
 * Fetches a contract scoped to its owner. RLS already prevents cross-user reads at the
 * database layer — this explicit user_id filter is defense-in-depth, matching the pattern
 * established across every feature spec, and lets us return a clean 404 instead of relying
 * on RLS silently returning zero rows.
 */
export async function getOwnedContract(contractId: string, userId: string): Promise<Contract> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) throw new NotFoundError()
  return data
}

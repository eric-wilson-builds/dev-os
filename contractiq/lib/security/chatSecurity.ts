import { createClient } from '@/lib/supabase/server'
import { getOwnedContract } from '@/lib/db/contracts'
import { NotFoundError } from '@/lib/api-error'
import type { Database } from '@/types/database'

type Contract = Database['public']['Tables']['contracts']['Row']
type ChatSession = Database['public']['Tables']['chat_sessions']['Row']

/** contract.user_id === auth.uid() — throws NotFoundError (404) on any mismatch. */
export async function verifyContractOwnership(contractId: string, userId: string): Promise<Contract> {
  return getOwnedContract(contractId, userId)
}

/** chat_session.user_id === auth.uid() — throws NotFoundError (404) on any mismatch. */
export async function verifySessionOwnership(sessionId: string, userId: string): Promise<ChatSession> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) throw new NotFoundError()
  return data
}

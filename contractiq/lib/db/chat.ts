import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type ChatSession = Database['public']['Tables']['chat_sessions']['Row']
type ChatMessage = Database['public']['Tables']['chat_messages']['Row']

export async function getChatSession(contractId: string): Promise<ChatSession | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('contract_id', contractId)
    .maybeSingle()

  return data
}

export async function getOrCreateChatSession(
  contractId: string,
  userId: string
): Promise<ChatSession> {
  const existing = await getChatSession(contractId)
  if (existing) return existing

  const supabase = createClient()
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ contract_id: contractId, user_id: userId })
    .select()
    .single()

  if (error || !data) throw new Error('chat_session_failed')
  return data
}

/** No SQL limit — used by GET .../chat, which must return full stored history for display. */
export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) return []
  return data
}

/**
 * Same rows as getMessages, capped to `limit` (most recent first, then re-ordered ascending) —
 * used when building the LLM prompt so a very long-running session can't force an unbounded
 * row fetch on every turn just to slice the last 10-20 for the model.
 */
export async function getRecentMessages(sessionId: string, limit: number): Promise<ChatMessage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return []
  return data.reverse()
}

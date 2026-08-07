import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type CustomKeyTerm = Database['public']['Tables']['custom_key_terms']['Row']

export async function getCustomTerms(contractId: string): Promise<CustomKeyTerm[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('custom_key_terms')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: true })

  if (error) return []
  return data
}

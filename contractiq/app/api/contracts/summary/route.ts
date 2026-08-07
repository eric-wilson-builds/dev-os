import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require-user'
import { apiError, UnauthorizedError } from '@/lib/api-error'
import type { Database } from '@/types/database'

type ContractSummaryRow = Pick<
  Database['public']['Tables']['contracts']['Row'],
  'id' | 'contract_type' | 'file_name' | 'status' | 'created_at'
>

export async function GET() {
  try {
    const user = await requireUser()
    const supabase = createClient()

    const { data: contracts, error } = await supabase
      .from('contracts')
      .select('id, contract_type, file_name, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .returns<ContractSummaryRow[]>()

    if (error) return apiError(500, 'query_failed')

    const total = contracts?.length ?? 0
    const byType = {
      nda: contracts?.filter((c) => c.contract_type === 'nda').length ?? 0,
      msa: contracts?.filter((c) => c.contract_type === 'msa').length ?? 0,
    }
    const recent = (contracts ?? []).slice(0, 5)

    return NextResponse.json({ total, byType, recent })
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    throw err
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require-user'
import { getOwnedContract } from '@/lib/db/contracts'
import { apiError, UnauthorizedError, NotFoundError } from '@/lib/api-error'

export async function GET(_req: NextRequest, { params }: { params: { contractId: string } }) {
  try {
    const user = await requireUser()
    const contract = await getOwnedContract(params.contractId, user.id)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('key_terms')
      .select('*')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: true })

    if (error) return apiError(500, 'query_failed')
    return NextResponse.json({ terms: data })
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof NotFoundError) return apiError(404, 'not_found')
    throw err
  }
}

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require-user'
import { getOwnedContract } from '@/lib/db/contracts'
import { apiError, UnauthorizedError, NotFoundError } from '@/lib/api-error'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { contractId: string; termId: string } }
) {
  try {
    const user = await requireUser()
    const contract = await getOwnedContract(params.contractId, user.id)
    if (contract.status !== 'pending') return apiError(422, 'invalid_state')

    const supabase = createClient()
    const { error } = await supabase
      .from('custom_key_terms')
      .delete()
      .eq('id', params.termId)
      .eq('contract_id', contract.id)

    if (error) return apiError(500, 'delete_failed')
    return new Response(null, { status: 204 })
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof NotFoundError) return apiError(404, 'not_found')
    throw err
  }
}

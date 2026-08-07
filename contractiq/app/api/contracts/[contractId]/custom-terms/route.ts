import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require-user'
import { getOwnedContract } from '@/lib/db/contracts'
import { getCustomTerms } from '@/lib/db/custom-terms'
import { apiError, UnauthorizedError, NotFoundError } from '@/lib/api-error'
import { customTermSchema } from '@/lib/validation/contracts'
import type { Database } from '@/types/database'

type CustomTermInsert = Database['public']['Tables']['custom_key_terms']['Insert']

const MAX_CUSTOM_TERMS = 5

export async function GET(_req: NextRequest, { params }: { params: { contractId: string } }) {
  try {
    const user = await requireUser()
    const contract = await getOwnedContract(params.contractId, user.id)
    const terms = await getCustomTerms(contract.id)
    return NextResponse.json({ terms })
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof NotFoundError) return apiError(404, 'not_found')
    throw err
  }
}

export async function POST(req: NextRequest, { params }: { params: { contractId: string } }) {
  try {
    const user = await requireUser()
    const contract = await getOwnedContract(params.contractId, user.id)
    if (contract.status !== 'pending') return apiError(422, 'invalid_state')

    const body = await req.json()
    const parsed = customTermSchema.safeParse(body)
    if (!parsed.success) return apiError(400, 'invalid_term_name')

    const supabase = createClient()
    const { count } = await supabase
      .from('custom_key_terms')
      .select('id', { count: 'exact', head: true })
      .eq('contract_id', contract.id)

    if ((count ?? 0) >= MAX_CUSTOM_TERMS) return apiError(400, 'limit_reached')

    const payload: CustomTermInsert = {
      contract_id: contract.id,
      user_id: user.id,
      term_name: parsed.data.term_name,
    }

    const { data, error } = await supabase.from('custom_key_terms').insert(payload).select().single()
    if (error) return apiError(400, 'limit_reached')

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof NotFoundError) return apiError(404, 'not_found')
    throw err
  }
}

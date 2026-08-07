import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require-user'
import { getOwnedContract } from '@/lib/db/contracts'
import { apiError, UnauthorizedError, NotFoundError } from '@/lib/api-error'
import { feedbackSchema } from '@/lib/validation/contracts'
import type { Database } from '@/types/database'

type FeedbackInsert = Database['public']['Tables']['user_feedback']['Insert']

export async function POST(req: NextRequest, { params }: { params: { contractId: string } }) {
  try {
    const user = await requireUser()
    const contract = await getOwnedContract(params.contractId, user.id)

    const body = await req.json()
    const parsed = feedbackSchema.safeParse(body)
    if (!parsed.success) return apiError(400, 'invalid_rating')

    const payload: FeedbackInsert = {
      contract_id: contract.id,
      user_id: user.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment?.trim() || null,
    }

    const supabase = createClient()
    const { data, error } = await supabase.from('user_feedback').insert(payload).select().single()
    if (error) return apiError(500, 'feedback_failed')

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof NotFoundError) return apiError(404, 'not_found')
    throw err
  }
}

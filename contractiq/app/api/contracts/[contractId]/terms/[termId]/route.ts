import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require-user'
import { getOwnedTerm } from '@/lib/db/key-terms'
import { apiError, UnauthorizedError, NotFoundError } from '@/lib/api-error'
import { patchTermSchema } from '@/lib/validation/contracts'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { contractId: string; termId: string } }
) {
  try {
    const user = await requireUser()
    const body = await req.json()
    const parsed = patchTermSchema.safeParse(body)
    if (!parsed.success) return apiError(400, 'invalid_value')

    const existing = await getOwnedTerm(params.termId, user.id)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('key_terms')
      .update({
        value: parsed.data.value,
        edited: true,
        original_ai_value: existing.original_ai_value ?? existing.value,
        edited_at: new Date().toISOString(),
      })
      .eq('id', params.termId)
      .select()
      .single()

    if (error) return apiError(500, 'query_failed')
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof NotFoundError) return apiError(404, 'not_found')
    throw err
  }
}

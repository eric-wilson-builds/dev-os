import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require-user'
import { getOwnedContract } from '@/lib/db/contracts'
import { getCustomTerms } from '@/lib/db/custom-terms'
import { checkRateLimit } from '@/lib/security/rateLimiter'
import { extractKeyTerms } from '@/lib/openai/extraction'
import { apiError, UnauthorizedError, NotFoundError, RateLimitError } from '@/lib/api-error'
import type { Database } from '@/types/database'

type KeyTermInsert = Database['public']['Tables']['key_terms']['Insert']

export async function POST(_req: NextRequest, { params }: { params: { contractId: string } }) {
  try {
    const user = await requireUser()
    await checkRateLimit(user.id, 'process')

    const contract = await getOwnedContract(params.contractId, user.id)
    if (contract.status !== 'pending' && contract.status !== 'error') {
      return apiError(422, 'invalid_state')
    }

    const supabase = createClient()
    await supabase.from('contracts').update({ status: 'processing' }).eq('id', contract.id)

    const customTerms = await getCustomTerms(contract.id)

    try {
      const terms = await extractKeyTerms({
        contractText: contract.contract_text,
        contractType: contract.contract_type,
        customTerms: customTerms.map((t) => t.term_name),
      })

      const rows: KeyTermInsert[] = terms.map((t) => ({
        contract_id: contract.id,
        user_id: user.id,
        term_name: t.term_name,
        value: t.value,
        page_number: t.page_number,
        confidence_score: t.confidence_score,
        source_sentence: t.source_sentence,
        is_custom: customTerms.some((ct) => ct.term_name === t.term_name),
      }))

      await supabase.from('key_terms').insert(rows)
      await supabase.from('contracts').update({ status: 'completed' }).eq('id', contract.id)

      return NextResponse.json({ status: 'completed', termCount: rows.length })
    } catch {
      await supabase.from('contracts').update({ status: 'error' }).eq('id', contract.id)
      return apiError(502, 'openai_failed')
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof NotFoundError) return apiError(404, 'not_found')
    if (err instanceof RateLimitError) {
      return apiError(429, 'rate_limited', undefined, { 'Retry-After': String(err.retryAfterSeconds) })
    }
    throw err
  }
}

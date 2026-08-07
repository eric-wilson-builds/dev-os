import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require-user'
import { apiError, UnauthorizedError, RateLimitError } from '@/lib/api-error'
import { uploadContractSchema, validateFileUpload } from '@/lib/security/inputValidator'
import { checkRateLimit } from '@/lib/security/rateLimiter'
import { MAX_PAGE_COUNT, MIN_EXTRACTED_WORDS, MAX_CONTRACT_TOKENS } from '@/lib/security/tokenLimiter'
import { extractPdfText, countWords, estimateTokens } from '@/lib/pdf/extract'
import { uploadToStorageBestEffort } from '@/lib/storage/contracts'
import type { Database } from '@/types/database'

type ContractInsert = Database['public']['Tables']['contracts']['Insert']

const SORT_COLUMNS = {
  date: 'created_at',
  name: 'file_name',
  type: 'contract_type',
} as const

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const { searchParams } = new URL(req.url)
    const sortColumn =
      SORT_COLUMNS[(searchParams.get('sort') ?? 'date') as keyof typeof SORT_COLUMNS] ??
      'created_at'
    const ascending = (searchParams.get('order') ?? 'desc') === 'asc'

    const supabase = createClient()
    const { data, error } = await supabase
      .from('contracts')
      .select('id, contract_type, file_name, status, created_at')
      .eq('user_id', user.id)
      .order(sortColumn, { ascending })

    if (error) return apiError(500, 'query_failed')
    return NextResponse.json({ contracts: data })
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    throw err
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    await checkRateLimit(user.id, 'upload')

    const form = await req.formData()
    const file = form.get('file')

    const parsed = uploadContractSchema.safeParse({
      contract_type: form.get('contract_type'),
    })
    if (!parsed.success) return apiError(400, 'invalid_contract_type')

    if (!(file instanceof File)) return apiError(400, 'invalid_contract_type')

    const fileCheck = validateFileUpload(file)
    if (!fileCheck.valid) return apiError(400, fileCheck.code)

    const buffer = Buffer.from(await file.arrayBuffer())

    let text: string
    let pageCount: number
    try {
      ;({ text, pageCount } = await extractPdfText(buffer))
    } catch {
      return apiError(500, 'extraction_failed')
    }

    if (pageCount > MAX_PAGE_COUNT) return apiError(400, 'too_many_pages')
    if (countWords(text) < MIN_EXTRACTED_WORDS) return apiError(400, 'scanned_pdf_unsupported')
    if (estimateTokens(text) > MAX_CONTRACT_TOKENS) return apiError(400, 'contract_too_long')

    const contractId = crypto.randomUUID()
    const filePath = await uploadToStorageBestEffort(user.id, contractId, file.name, buffer)

    const payload: ContractInsert = {
      id: contractId,
      user_id: user.id,
      contract_type: parsed.data.contract_type,
      file_name: file.name,
      file_path: filePath,
      contract_text: text,
      page_count: pageCount,
      status: 'pending',
    }

    const supabase = createClient()
    const { data, error } = await supabase.from('contracts').insert(payload).select().single()

    if (error) return apiError(500, 'extraction_failed')
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof RateLimitError) {
      return apiError(429, 'rate_limited', undefined, { 'Retry-After': String(err.retryAfterSeconds) })
    }
    throw err
  }
}

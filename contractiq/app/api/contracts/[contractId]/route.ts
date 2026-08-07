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
    await supabase
      .from('contracts')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', contract.id)

    let signedUrl: string | null = null
    if (contract.file_path) {
      const { data } = await supabase.storage
        .from('contracts')
        .createSignedUrl(contract.file_path, 60 * 60)
      signedUrl = data?.signedUrl ?? null
    }

    return NextResponse.json({ ...contract, signedUrl })
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof NotFoundError) return apiError(404, 'not_found')
    throw err
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { contractId: string } }) {
  try {
    const user = await requireUser()
    const contract = await getOwnedContract(params.contractId, user.id)

    const supabase = createClient()

    if (contract.file_path) {
      await supabase.storage.from('contracts').remove([contract.file_path])
    }

    const { error } = await supabase.from('contracts').delete().eq('id', contract.id)
    if (error) return apiError(500, 'delete_failed')

    return new Response(null, { status: 204 })
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof NotFoundError) return apiError(404, 'not_found')
    throw err
  }
}

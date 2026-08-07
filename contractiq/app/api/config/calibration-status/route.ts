import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('app_config')
    .select('value')
    .eq('key', 'calibration_status')
    .maybeSingle()

  return NextResponse.json({ calibrationStatus: data?.value ?? 'ok' })
}

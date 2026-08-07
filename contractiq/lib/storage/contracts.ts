import { createClient } from '@/lib/supabase/server'

/**
 * Upload is intentionally non-blocking (pdf-upload-spec.md): any failure here just leaves
 * file_path null on the contract row — the results page falls back to the text viewer.
 */
export async function uploadToStorageBestEffort(
  userId: string,
  contractId: string,
  fileName: string,
  buffer: Buffer
): Promise<string | null> {
  try {
    const supabase = createClient()
    const safeName = fileName.replace(/[/\\]/g, '_')
    const path = `${userId}/${contractId}/${safeName}`

    const { error } = await supabase.storage.from('contracts').upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

    if (error) return null
    return path
  } catch {
    return null
  }
}

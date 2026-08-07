import { MAX_FILE_BYTES } from './tokenLimiter'

export * from '@/lib/validation/contracts'

const ALLOWED_EXTENSIONS = ['.pdf']

// Explicit blocklist checked first — executables and scripts are rejected even if somehow
// disguised with a trailing allowed-looking name, before the allowlist check runs.
const BLOCKED_EXTENSIONS = [
  '.exe', '.js', '.mjs', '.cjs', '.php', '.zip', '.sh', '.bat', '.cmd', '.py', '.rb', '.ps1',
]

const ALLOWED_MIME_TYPES = ['application/pdf']

export type FileValidationResult = { valid: true } | { valid: false; code: string }

function extensionOf(fileName: string): string {
  const lower = fileName.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot === -1 ? '' : lower.slice(dot)
}

/**
 * Order matters: extension blocklist → extension allowlist → MIME type → size. Cheapest and
 * most dangerous checks run first so a malicious upload never reaches the pdf-parse call.
 */
export function validateFileUpload(file: File): FileValidationResult {
  const ext = extensionOf(file.name)

  if (BLOCKED_EXTENSIONS.includes(ext)) return { valid: false, code: 'invalid_file_type' }
  if (!ALLOWED_EXTENSIONS.includes(ext)) return { valid: false, code: 'invalid_file_type' }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) return { valid: false, code: 'invalid_file_type' }
  if (file.size > MAX_FILE_BYTES) return { valid: false, code: 'file_too_large' }

  return { valid: true }
}

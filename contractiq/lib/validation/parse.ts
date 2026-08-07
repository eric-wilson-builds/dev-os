import type { ZodSchema } from 'zod'
import { apiError } from '@/lib/api-error'

export function parseOrError<T>(schema: ZodSchema<T>, data: unknown) {
  const result = schema.safeParse(data)

  if (!result.success) {
    const code = result.error.issues[0]?.message ?? 'validation_error'
    return { data: null, error: apiError(400, code) }
  }

  return { data: result.data, error: null }
}

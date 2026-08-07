import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().email('invalid_credentials'),
  password: z.string().min(1, 'invalid_credentials'),
})

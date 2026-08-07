import { z } from 'zod'

export const uploadContractSchema = z.object({
  contract_type: z.enum(['nda', 'msa'], {
    errorMap: () => ({ message: 'invalid_contract_type' }),
  }),
})

export const customTermSchema = z.object({
  term_name: z.string().trim().min(1, 'invalid_term_name').max(100, 'invalid_term_name'),
})

export const patchTermSchema = z.object({
  value: z.string().trim().min(1, 'invalid_value'),
})

export const chatMessageSchema = z.object({
  message: z.string().trim().min(1, 'invalid_message').max(2000, 'invalid_message'),
})

export const feedbackSchema = z.object({
  rating: z.enum(['up', 'down'], { errorMap: () => ({ message: 'invalid_rating' }) }),
  comment: z.string().trim().max(2000).optional(),
})

export const contractListQuerySchema = z.object({
  sort: z.enum(['date', 'name', 'type']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

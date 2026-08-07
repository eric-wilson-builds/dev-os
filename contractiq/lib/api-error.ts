import { NextResponse } from 'next/server'

const DEFAULT_MESSAGES: Record<string, string> = {
  unauthorized: 'You must be signed in to do that.',
  not_found: 'We couldn’t find that contract.',
  validation_error: 'That request wasn’t valid.',
  invalid_contract_type: 'Contract type must be either NDA or MSA.',
  file_too_large: 'This file is larger than 10MB — please upload a smaller PDF.',
  too_many_pages: 'This contract has more than 20 pages, which isn’t supported yet.',
  scanned_pdf_unsupported: 'Scanned PDFs are not supported yet — please upload a text-layer PDF.',
  contract_too_long: 'This contract exceeds the supported length.',
  extraction_failed: 'We couldn’t read this file — please check it’s a valid PDF and try again.',
  invalid_state: 'This contract isn’t in the right state for that action.',
  openai_failed: 'Something went wrong analyzing this contract — please try again.',
  limit_reached: 'Maximum 5 custom terms per analysis.',
  invalid_term_name: 'Please enter a valid term name (1–100 characters).',
  invalid_value: 'Value can’t be empty.',
  invalid_message: 'Message can’t be empty and must be under 2,000 characters.',
  invalid_rating: 'Rating must be either up or down.',
  feedback_failed: 'We couldn’t save your feedback — please try again.',
  delete_failed: 'We couldn’t delete this contract — please try again.',
  query_failed: 'We couldn’t load your contracts — please try again.',
  rate_limited: 'Too many requests — please try again in a little while.',
  invalid_file_type: 'Only PDF files are supported.',
  prompt_injection: 'This message can’t be sent — please rephrase your question.',
  invalid_credentials: 'Invalid email or password.',
}

function defaultMessage(code: string): string {
  return DEFAULT_MESSAGES[code] ?? 'Something went wrong — please try again.'
}

export function apiError(status: number, code: string, message?: string, headers?: HeadersInit) {
  return NextResponse.json(
    { error: { code, message: message ?? defaultMessage(code) } },
    { status, headers }
  )
}

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized')
    this.name = 'UnauthorizedError'
  }
}

export class NotFoundError extends Error {
  constructor() {
    super('not_found')
    this.name = 'NotFoundError'
  }
}

export class RateLimitError extends Error {
  retryAfterSeconds: number

  constructor(message: string, retryAfterSeconds: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

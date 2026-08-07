/**
 * Screens short, user-typed chat messages for direct prompt-injection attempts before they
 * reach the LLM. This is NOT run against contract_text — a real contract can legitimately
 * contain phrases like "acting as an independent contractor" or "the parties agree to act in
 * good faith", and blocking on those would break the core product. Contract text is untrusted
 * *content*, defended against instead by the system-prompt hardening in lib/openai/chat.ts and
 * lib/openai/extraction.ts, which tell the model to never treat document text as instructions.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+instructions?/i,
  /disregard\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?)/i,
  /override\s+your\s+rules/i,
  /reveal\s+(your\s+)?system\s+prompt/i,
  /print\s+your\s+instructions/i,
  /show\s+(me\s+)?(your\s+)?(system\s+)?prompt/i,
  /expose\s+(the\s+)?env(ironment)?\s+variables?/i,
  /show\s+(me\s+)?(the\s+)?api\s+keys?/i,
  /you\s+are\s+now\s+a\b/i,
  /act\s+as\s+(a|an)\b/i,
  /pretend\s+(you('|’)re|to\s+be)\b/i,
  /\bjailbreak\b/i,
  /\bDAN\s+mode\b/i,
  /developer\s+mode/i,
]

export type SanitizeResult = { safe: true; text: string } | { safe: false }

export function sanitizeForLLM(input: string): SanitizeResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) return { safe: false }
  }
  return { safe: true, text: input }
}

export type QueryClassification = 'contract' | 'history' | 'both'

/**
 * Questions purely about the conversation itself — no document grounding needed. Allows up to
 * 3 filler words between anchor phrases (e.g. "what did I *just* ask you") so natural phrasing
 * variations don't fall through to a stricter exact-phrase match.
 */
const PURE_HISTORY_MARKERS =
  /\b(what did (you|i)\b(?:\s+\w+){0,3}\s+(say|ask|mention)|what was my\b(?:\s+\w+){0,2}\s+(last|previous) question|summarize (our|this|the) conversation|recap( our)? conversation|repeat (that|your last answer|what you said))\b/i

/** Looser signal that the question references the conversation but likely still needs the document too. */
const REFERENCES_HISTORY_MARKERS = /\b(earlier|before|you said|previously|last time|we discussed)\b/i

/**
 * Cheap keyword heuristic, run synchronously before the OpenAI call — no separate model
 * invocation. `hasHistory` gates history-aware classification: a fresh session with no prior
 * messages has nothing to reference, so it's always 'contract' regardless of wording.
 */
export function classifyQuery(message: string, hasHistory: boolean): QueryClassification {
  if (!hasHistory) return 'contract'

  if (PURE_HISTORY_MARKERS.test(message)) return 'history'
  if (REFERENCES_HISTORY_MARKERS.test(message)) return 'both'
  return 'contract'
}

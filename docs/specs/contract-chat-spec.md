# Spec: Contract Chat (Q&A)

**PRD component:** F — Contract Chat Agent
**Priority:** P1 (US-007, US-012, FR-08, FR-09)

## User flow

1. On the results page, the user opens the Chat panel (floating button or sidebar tab).
2. If a `chat_sessions` row already exists for this contract, prior messages load in ascending
   order (US-012 — persistent history).
3. User types a question, submits.
4. Frontend optimistically appends the user message to the local message list, then
   `POST /api/contracts/{id}/chat`.
5. Backend streams the GPT-4o response token-by-token; the frontend renders tokens as they
   arrive.
6. On stream completion, the assistant message (with parsed `[Page X]` citation) is persisted;
   the citation renders as a clickable link that calls `setTargetPage` (same Zustand state used
   by the key-terms panel, per `results-display-spec.md`).

Acceptance criteria (PRD US-007, FR-08, FR-09): response within 15s P95; grounded in the
uploaded document only; every response cites a page number; messages persist with role and
timestamp, linked `chat_sessions → contracts → users`.

## Grounding & guardrails (from engineering-doc.md §8)

- System prompt: *"Answer only from the document text provided. If the answer is not in the
  document, say so."*
- Full `contract_text` + up to 200 prior messages (ascending) passed on every turn — no
  chunking/retrieval, since contracts are capped at 15,000 tokens.
- `temperature: 0.4`, `max_tokens: 1000`.
- Every response must include a `[Page X]` citation; the Route Handler parses this out of the
  completed text via regex (`/\[Page (\d+)\]/`) into `page_citation` before persisting — if no
  citation is found in the model's output, store `page_citation: null` and prepend "Based on
  the document…" framing is still applied client-side regardless.
- "I cannot find this in the document" is a valid, expected response, not an error state.

## Query classification (`contract` / `history` / `both`)

Resolves the PRD's requirement for adjusting context "without an extra API call": implement as
a cheap keyword heuristic run synchronously before the OpenAI call (no separate model
invocation):

```ts
// lib/openai/classify-query.ts
const HISTORY_MARKERS = /\b(earlier|before|you said|previously|last time|we discussed)\b/i

export function classifyQuery(message: string): 'contract' | 'history' | 'both' {
  const referencesHistory = HISTORY_MARKERS.test(message)
  return referencesHistory ? 'both' : 'contract'
}
```

- `'contract'` (default): system prompt emphasizes document-only grounding as written above.
- `'both'`: system prompt adds a clause acknowledging the conversation history is available
  for "what did you say earlier" style questions, while still requiring any *contract fact*
  claim to carry a page citation. `'history'`-only is folded into `'both'` at MVP — there's no
  case where a contract-review chat should answer purely from conversation memory without at
  least considering the document, so the three-way enum resolves to two effective prompt
  variants in practice.

## Database

Tables: `chat_sessions` (one per contract, created lazily on first message), `chat_messages`
(role, content, page_citation). See `supabase-schema.sql`.

## API / Route Handlers

### `POST /api/contracts/{contractId}/chat`

```ts
// Request: { message: string }   — max 2000 chars
// Response: text/event-stream — tokens as they arrive; a final `event: done` frame carries
//   { messageId, page_citation }
// Errors: 400 invalid_message (empty or too long), 502 openai_failed (after 3 retries)
```

```ts
export async function POST(req: NextRequest, { params }: { params: { contractId: string } }) {
  const user = await requireUser(req)
  const contract = await getOwnedContract(params.contractId, user.id)
  const { message } = await req.json()
  if (!message?.trim() || message.length > 2000) return apiError(400, 'invalid_message')

  const session = await getOrCreateChatSession(contract.id, user.id)

  await supabase.from('chat_messages').insert({
    session_id: session.id, user_id: user.id, role: 'user', content: message,
  })

  const history = await getMessages(session.id) // ascending, up to 200
  const classification = classifyQuery(message)

  const stream = await streamChatCompletion({
    contractText: contract.contract_text,
    history,
    classification,
  }) // lib/openai/chat.ts — wraps OpenAI streaming + the 3-retry backoff on connection failure

  return new Response(
    new ReadableStream({
      async start(controller) {
        let fullText = ''
        for await (const chunk of stream) {
          fullText += chunk
          controller.enqueue(new TextEncoder().encode(chunk))
        }
        const pageCitation = fullText.match(/\[Page (\d+)\]/)?.[1] ?? null
        await supabase.from('chat_messages').insert({
          session_id: session.id, user_id: user.id, role: 'assistant',
          content: fullText, page_citation: pageCitation ? Number(pageCitation) : null,
        })
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )
}
```

### `GET /api/contracts/{contractId}/chat`

```ts
// Response 200: { sessionId: string | null, messages: [{ id, role, content, page_citation, created_at }] }
// sessionId is null if no session exists yet (fresh contract, no messages sent)
```

## State management

- `useQuery(['contract', id, 'chat'])` loads history on mount.
- The in-flight streamed message is **not** TanStack Query state — it's local component state
  in `ChatPanel` (accumulating chunks as they arrive), appended to the query cache only once
  the stream's `done` event lands, via `queryClient.setQueryData`.
- Draft message text (composer input) is local `useState`, not global.

## Components

```
components/results/
├── ChatPanel.tsx        — floating panel or sidebar tab, owns the fetch-stream loop
├── MessageList.tsx       — renders persisted + in-flight messages, role-based alignment (user right, assistant left)
├── MessageComposer.tsx   — textarea + send button, disabled while a response is streaming
└── PageCitationLink.tsx  — renders "[Page X]" as a clickable chip calling setTargetPage(x)
```

## Design binding

User messages: right-aligned bubble, `Blue 50` background, `Grey 900` text. Assistant
messages: left-aligned, `White`/`Grey 25` background, `Grey 900` text, with the page-citation
chip styled as the Semantic Status Badge pattern in `Blue 500`/`Blue 50`.

## Edge cases

- Question about something absent from the document → model responds "I cannot find this in
  the document" — render this exactly like any other assistant message, no special error
  styling; this is success, not failure, per PRD §7/§9.
- OpenAI stream errors mid-response (connection drop) → the `ReadableStream` catch path writes
  a partial-failure assistant message ("Something went wrong generating a response — please
  try asking again") instead of persisting a truncated answer; no `page_citation` is attached.
- User sends a message before the previous one's stream has completed → disable the composer
  while `isStreaming` is true (enforced client-side); the backend has no concurrency guard
  since only one request per contract's chat session is expected from a single active tab.
- Reopening a contract with an existing 190+ message history → the "up to 200 messages" cap
  means once a session hits 200, the oldest messages should stop being sent to the model on
  new turns (windowing at 200, not deleting stored history) — implement as `history.slice(-200)`
  in `lib/openai/chat.ts` before building the prompt, while `GET .../chat` still returns full
  stored history for display.

# Spec: Key Term Extraction (OpenAI)

**PRD component:** C — Key Term Extraction via OpenAI
**Priority:** P0 (US-004, US-003, US-011-partial, FR-04, FR-11)

## User flow

1. After upload (see `pdf-upload-spec.md`) and optional custom-term addition (see
   `custom-terms-spec.md`), the user clicks **Process Contract**.
2. Frontend shows a 3-step progress indicator (extracting text ✓ → analyzing with AI →
   compiling results) and calls `POST /api/contracts/{id}/process`.
3. Backend builds the extraction prompt from `contract_text` + the standard term schema for
   the contract's type + any custom terms, calls GPT-4o in JSON mode.
4. On success, `key_terms` rows are inserted (standard + custom, same structure) and
   `contracts.status` becomes `'completed'`.
5. Client navigates to the results page and renders the key-terms panel (see
   `results-display-spec.md`).

Acceptance criteria (PRD US-002 latency, US-003, US-004, FR-04, FR-11): ≤30s P95 end-to-end;
every term has term name, value, page number, confidence score; confidence < 50% renders a ⚠️
warning and is never hidden; clicking a page number scrolls the viewer to that page (owned by
`results-display-spec.md`).

## Standard term schema (per contract type)

**NDA** (10 terms): Parties, Effective Date, Confidentiality Obligations, Permitted
Disclosures, Term & Duration, Governing Law, Jurisdiction, IP Ownership, Non-Solicitation,
Breach & Remedy.

**MSA** (11 terms): Parties, Service Scope, Payment Terms, Invoice Schedule, Late Payment
Penalty, Liability Cap, Indemnification, IP Ownership, Termination Clause, Governing Law,
Dispute Resolution, Notice Period.

Store these two lists as a constant in `lib/openai/term-schemas.ts` — they are injected
verbatim into the extraction prompt, not derived dynamically.

## Prompt strategy

- **Technique:** few-shot — embed 3 labelled NDA examples and 3 labelled MSA examples in the
  system prompt (sourced from the CUAD dataset / internal SME-labelled contracts per PRD §10).
- **Output schema:** `[{ term_name: string, value: string, page_number: number,
  confidence_score: number, source_sentence: string }]`
- **Settings:** `temperature: 0.1`, `response_format: { type: 'json_object' }`,
  `max_tokens: 2000`.
- **Custom terms:** appended to the target list zero-shot, sharing the identical schema — the
  model produces one flat array covering standard + custom terms; the Route Handler sets
  `is_custom = true` for entries whose `term_name` matches a row in `custom_key_terms` for this
  contract.
- **Retry on invalid JSON:** if `JSON.parse` fails, send exactly one retry with: "Your previous
  response was not valid JSON. Return only the JSON array, no explanation." If that also fails,
  set `status = 'error'` and surface a retryable error — no partial output is stored.
- **Retry on OpenAI failure (rate limit / 5xx):** wrap the call in `lib/retry.ts`'s
  exponential backoff, 3 attempts (1s, 2s, 4s backoff), before giving up.

## Database

Writes to `key_terms` (insert per term) and updates `contracts.status`. See
`supabase-schema.sql`. `custom_key_terms` rows are read (not written) here — they were created
in the custom-terms flow.

## API / Route Handlers

### `POST /api/contracts/{contractId}/process`

```ts
// Response 200: { status: 'completed', termCount: number }
// Errors:
//   404 { error: { code: 'not_found' } }
//   422 { error: { code: 'invalid_state', message: 'Contract is not pending' } }
//   502 { error: { code: 'openai_failed' } }  — after 3 retries; contracts.status set to 'error'
```

```ts
export async function POST(req: NextRequest, { params }: { params: { contractId: string } }) {
  const user = await requireUser(req)
  const contract = await getOwnedContract(params.contractId, user.id) // 404 if missing/not owned
  if (contract.status !== 'pending') return apiError(422, 'invalid_state')

  await supabase.from('contracts').update({ status: 'processing' }).eq('id', contract.id)

  const customTerms = await getCustomTerms(contract.id)

  try {
    const terms = await extractKeyTerms({
      contractText: contract.contract_text,
      contractType: contract.contract_type,
      customTerms: customTerms.map(t => t.term_name),
    }) // lib/openai/extraction.ts — handles retry + JSON-repair internally

    const rows = terms.map(t => ({
      contract_id: contract.id,
      user_id: user.id,
      term_name: t.term_name,
      value: t.value,
      page_number: t.page_number,
      confidence_score: t.confidence_score,
      source_sentence: t.source_sentence,
      is_custom: customTerms.some(ct => ct.term_name === t.term_name),
    }))

    await supabase.from('key_terms').insert(rows)
    await supabase.from('contracts').update({ status: 'completed' }).eq('id', contract.id)

    return NextResponse.json({ status: 'completed', termCount: rows.length })
  } catch (e) {
    await supabase.from('contracts').update({ status: 'error' }).eq('id', contract.id)
    return apiError(502, 'openai_failed')
  }
}
```

### `GET /api/contracts/{contractId}/terms`

Returns all `key_terms` rows for the contract, ordered by `created_at asc`. Used by the
results page (see `results-display-spec.md`).

### `PATCH /api/contracts/{contractId}/terms/{termId}`

Inline correction — owned jointly with `results-display-spec.md` since it's a UI action on the
key-terms panel, but documented here because it's the write path into the same table:

```ts
// Request: { value: string }
// Response 200: updated row, edited: true — must complete within 2s (US-009)
export async function PATCH(req, { params }) {
  const user = await requireUser(req)
  const { value } = await req.json()
  if (!value?.trim()) return apiError(400, 'invalid_value')

  const existing = await getOwnedTerm(params.termId, user.id)
  const { data } = await supabase.from('key_terms').update({
    value,
    edited: true,
    original_ai_value: existing.original_ai_value ?? existing.value, // preserve first AI value only
    edited_at: new Date().toISOString(),
  }).eq('id', params.termId).select().single()

  return NextResponse.json(data)
}
```

## State management

- `useQuery(['contract', id, 'terms'])` fetches the term list; `useMutation` for the `PATCH`
  edit calls `queryClient.setQueryData` to optimistically update the single term, falling back
  to `invalidateQueries` on error.
- Processing progress (step 1/2/3 indicator) is local Zustand UI state
  (`store/ui-store.ts` → `processingStep`), driven by which request is in-flight — there is no
  granular server-side progress event at MVP (single request/response for `/process`).

## Components

```
components/upload/ProcessingIndicator.tsx   — 3-step progress UI
components/results/KeyTermsPanel.tsx        — renders terms, owned jointly with results-display-spec.md
```

## Design binding

Confidence badges: green ≥80% (`Green 500` on `Green 50`), amber 50–79% (`Yellow 500` on
`Yellow 50`), red <50% (`Red 500` on `Red 50`) — matches the Semantic Status Badge pattern in
`docs/design.md`.

## Edge cases

- Confidence < 50%: render with ⚠️ + non-dismissible tooltip ("Low confidence — we recommend
  verifying this in the document directly"); term is **never** omitted from the list.
- Model returns fewer terms than the standard schema (e.g. a clause genuinely absent from the
  contract): still render the term row with `value: "Not found in document"` and a low/zero
  confidence score rather than silently dropping it — the prompt should instruct the model to
  always return every requested term_name, using this fallback when absent. Update
  `lib/openai/extraction.ts`'s prompt accordingly.
- OpenAI timeout/5xx exhausts all 3 retries: `contracts.status = 'error'`, results page shows
  "Something went wrong analyzing this contract" + a **Retry** button that re-calls `/process`
  (contract stays `pending`-eligible since `status` was set to `'error'`, and the Route Handler
  should treat `'error'` as re-triggerable in addition to `'pending'`).
- User edits a term, then edits it again: `original_ai_value` must NOT be overwritten a second
  time — the `COALESCE`-style guard above (`existing.original_ai_value ?? existing.value`)
  ensures only the true first AI output is preserved for the correction feedback loop.

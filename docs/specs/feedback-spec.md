# Spec: Feedback Collection

**PRD component:** H — Feedback Logger
**Priority:** P2 (US-010, FR-12)

## User flow

1. On the results page (below the key-terms panel or in a persistent footer), the user sees a
   thumbs-up / thumbs-down control and an optional comment field.
2. Selecting a rating immediately enables a **Submit Feedback** action (comment is optional).
3. On submit, `POST /api/contracts/{id}/feedback` is called; on success, the control shows a
   brief "Thanks for the feedback" confirmation and becomes read-only for that session (a user
   can still resubmit later — see edge cases).

Acceptance criteria (PRD US-010, FR-12): thumbs up/down + optional text comment available on
the results page; feedback saved to `user_feedback` with `user_id`, `contract_id`, `rating`,
`comment`, `timestamp`.

## Database

Table: `user_feedback` (see `supabase-schema.sql`). No relationship beyond the standard
`contract_id`/`user_id` foreign keys — this is an append-only log, not something the app reads
back into the UI at MVP (aggregate feedback analysis is a product/ops concern, not an in-app
feature per the PRD).

## API / Route Handlers

### `POST /api/contracts/{contractId}/feedback`

```ts
// Request: { rating: 'up' | 'down', comment?: string }
// Response 201: { id, rating, comment, created_at }
// Errors: 400 invalid_rating, 404 not_found (contract not owned)
```

```ts
export async function POST(req: NextRequest, { params }: { params: { contractId: string } }) {
  const user = await requireUser(req)
  const contract = await getOwnedContract(params.contractId, user.id)
  const { rating, comment } = await req.json()

  if (!['up', 'down'].includes(rating)) return apiError(400, 'invalid_rating')

  const { data, error } = await supabase.from('user_feedback').insert({
    contract_id: contract.id,
    user_id: user.id,
    rating,
    comment: comment?.trim() || null,
  }).select().single()

  if (error) return apiError(500, 'feedback_failed')
  return NextResponse.json(data, { status: 201 })
}
```

## State management

`useMutation` for the submit action; no query/cache needed since feedback isn't read back into
any UI at MVP. Local component state holds the selected rating + comment draft before submit.

## Components

```
components/results/FeedbackWidget.tsx   — thumbs up/down toggle, optional comment textarea, submit button
```

## Design binding

Thumbs toggle uses filled/outline icon states with `Green 500` (up) / `Red 500` (down) on
selection, matching the state-colors table's Success/Error rows. Comment textarea follows the
same input styling as the auth forms (`6px` radius, Grey 100 default border).

## Edge cases

- User submits multiple times for the same contract → allowed; each submission is a new row
  (append-only log), there's no upsert-by-contract constraint. This matches the PRD's framing
  of feedback as a simple write with no read-modify cycle.
- Comment left empty → stored as `null`, not an empty string, so downstream analytics queries
  can distinguish "no comment given" from "empty comment."
- Comment exceeding a reasonable length (e.g. 2,000 chars) → truncate client-side with a
  character counter; not a hard PRD requirement but prevents accidental pastes of entire
  documents into the feedback field.

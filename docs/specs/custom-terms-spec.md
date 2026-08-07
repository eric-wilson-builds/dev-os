# Spec: Custom Key Term Addition

**PRD component:** D — Custom Term Addition
**Priority:** P0 (US-005, FR-05)

## User flow

1. During the pre-processing preview (after upload, before clicking Process Contract), the
   user sees the standard term list for the selected contract type and a **+ Add Key Term**
   button.
2. Clicking it opens an inline text input; the user types a term name (e.g. "Non-compete
   radius") and confirms.
3. The term appears in the preview list tagged with a "Custom" badge.
4. The user may add up to 5 custom terms total. The "+ Add Key Term" control disables/hides
   once the limit is reached, with a message: "Maximum 5 custom terms per analysis."
5. Custom terms are persisted immediately on add (not batched until Process) via
   `POST /api/contracts/{id}/custom-terms`, so they survive a page refresh before processing.
6. When the user clicks **Process Contract**, `key-term-extraction-spec.md`'s `/process` route
   reads these rows and injects them into the extraction prompt.

Acceptance criteria (PRD US-005, FR-05): custom terms appear in the pre-processing preview;
processed results include custom term extraction with the same structure (value, page,
confidence) as standard terms.

## Database

Table: `custom_key_terms` (see `supabase-schema.sql`) — `contract_id`, `user_id`, `term_name`.
A `before insert` trigger (`check_custom_key_terms_limit`) enforces the 5-term cap at the
database layer as a backstop; the Route Handler enforces it first for a clean error message.

## API / Route Handlers

### `POST /api/contracts/{contractId}/custom-terms`

```ts
// Request: { term_name: string }   — one term per call, matching the "+ Add Key Term" UX
// Response 201: { id, term_name }
// Errors:
//   400 { error: { code: 'limit_reached', message: 'Maximum 5 custom terms per analysis' } }
//   400 { error: { code: 'invalid_term_name' } }  — empty or > 100 chars
//   422 { error: { code: 'invalid_state' } }      — contract already processed
```

```ts
export async function POST(req: NextRequest, { params }: { params: { contractId: string } }) {
  const user = await requireUser(req)
  const contract = await getOwnedContract(params.contractId, user.id)
  if (contract.status !== 'pending') return apiError(422, 'invalid_state')

  const { term_name } = await req.json()
  if (!term_name?.trim() || term_name.length > 100) return apiError(400, 'invalid_term_name')

  const { count } = await supabase
    .from('custom_key_terms')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', contract.id)
  if ((count ?? 0) >= 5) return apiError(400, 'limit_reached')

  const { data, error } = await supabase.from('custom_key_terms')
    .insert({ contract_id: contract.id, user_id: user.id, term_name: term_name.trim() })
    .select().single()

  if (error) return apiError(400, 'limit_reached') // DB trigger caught a race
  return NextResponse.json(data, { status: 201 })
}
```

### `GET /api/contracts/{contractId}/custom-terms`

Returns the current list — used to re-render the preview if the user navigates away and back
before processing.

### `DELETE /api/contracts/{contractId}/custom-terms/{termId}`

Removes a custom term the user added by mistake, before processing. Only valid while
`contract.status === 'pending'`.

## State management

`useQuery(['contract', id, 'custom-terms'])`; adding/removing a term triggers
`invalidateQueries` on that key so the preview list and the remaining-slots counter
(`5 - terms.length`) stay in sync. No Zustand needed — this is pure server state.

## Components

```
components/upload/
├── TermPreviewList.tsx     — renders standard terms (from lib/openai/term-schemas.ts) + custom terms
└── AddCustomTermButton.tsx — inline input, disabled at 5, shows remaining-slots count
```

## Design binding

"Custom" badge follows the Tags/badges radius token (`4px`) and uses `Violet 500`/`Violet 50`
(Accent color family in `docs/design.md`) to visually distinguish from the confidence badges
(Green/Yellow/Red), which are reserved for post-processing results.

## Edge cases

- Duplicate custom term name (e.g. user adds "Non-compete radius" twice) → allow it; the
  extraction prompt will simply produce two rows with the same `term_name`. Not worth blocking
  since the user may intentionally want two phrasings — out of scope to dedupe at MVP.
- User tries to add a 6th term via a raced double-click → the DB trigger
  (`check_custom_key_terms_limit`) rejects the insert even if the Route Handler's own count
  check raced past 5, so the hard cap holds regardless of client timing.
- User adds custom terms, then abandons the upload (never clicks Process) → rows remain in
  `custom_key_terms` tied to a `pending` contract indefinitely; cleaned up naturally if the user
  later deletes the contract (cascade delete), otherwise harmless orphaned rows scoped to their
  own `user_id`.

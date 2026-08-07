# Spec: Dashboard & History

**PRD component:** G — Dashboard & History
**Priority:** P1 (US-008, FR-10)

## User flow

1. Returning user signs in, lands on `/dashboard`.
2. A summary card shows total contracts reviewed and a breakdown by type (NDA / MSA).
3. A sortable list shows all previous contracts (name, type, date uploaded, status).
4. Clicking any row opens `/contracts/{id}` (the results page).
5. A prominent **Review a Contract** CTA navigates to `/upload`.
6. First-time users (zero contracts) see an empty state instead of the list:
   *"No contracts reviewed yet — upload your first contract to begin."*

Acceptance criteria (PRD US-008, FR-10): dashboard displays contract name, type, date
uploaded, and status; sortable by date, name, type; clicking any row opens the results page.

## Database

Read-only: `SELECT` on `contracts` filtered by `user_id` (RLS-enforced regardless). No new
tables — this spec is purely a read/aggregation layer over the `contracts` table defined in
`supabase-schema.sql`.

## API / Route Handlers

### `GET /api/contracts`

```ts
// Query params: sort=('date'|'name'|'type'), order=('asc'|'desc'), default sort=date, order=desc
// Response 200: { contracts: [{ id, contract_type, file_name, status, created_at }] }
```

```ts
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  const { searchParams } = new URL(req.url)
  const sortColumn = { date: 'created_at', name: 'file_name', type: 'contract_type' }
    [searchParams.get('sort') ?? 'date'] ?? 'created_at'
  const ascending = (searchParams.get('order') ?? 'desc') === 'asc'

  const { data, error } = await supabase
    .from('contracts')
    .select('id, contract_type, file_name, status, created_at')
    .eq('user_id', user.id)
    .order(sortColumn, { ascending })

  if (error) return apiError(500, 'query_failed')
  return NextResponse.json({ contracts: data })
}
```

### `GET /api/contracts/summary`

```ts
// Response 200: { total: number, byType: { nda: number, msa: number }, recent: Contract[5] }
```

```ts
export async function GET(req: NextRequest) {
  const user = await requireUser(req)

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, contract_type, file_name, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const total = contracts?.length ?? 0
  const byType = {
    nda: contracts?.filter(c => c.contract_type === 'nda').length ?? 0,
    msa: contracts?.filter(c => c.contract_type === 'msa').length ?? 0,
  }
  const recent = (contracts ?? []).slice(0, 5)

  return NextResponse.json({ total, byType, recent })
}
```

Both routes rely on RLS as the final authorization boundary; the explicit `.eq('user_id',
user.id)` filter is defense-in-depth, matching the pattern established in every other spec.

## State management

`useQuery(['contracts', { sort, order }])` and `useQuery(['contracts', 'summary'])` — both pure
TanStack Query server state. Sort/order selection is local component state that becomes a query
key, so switching sort re-fetches (or hits cache if already fetched for that combination) rather
than re-sorting client-side — keeps the two aggregation routes as the single source of truth.

## Components

```
app/(dashboard)/dashboard/page.tsx
components/dashboard/
├── SummaryCard.tsx    — total + by-type breakdown, "Review a Contract" CTA
├── ContractList.tsx    — sortable table (desktop) / stacked cards (mobile)
├── ContractRow.tsx     — name, type badge, date, status badge; onClick navigates to /contracts/{id};
│                         secondary delete icon-button opens components/shared/ConfirmDeleteModal.tsx
│                         and calls DELETE /api/contracts/{id} (see results-display-spec.md)
└── EmptyState.tsx      — zero-contracts illustration + CTA
```

## Design binding

Status badges (`pending` / `processing` / `completed` / `error`) reuse the Semantic Status
Badge pattern: `processing` → Blue, `completed` → Green, `error` → Red, `pending` → Grey.
Table follows the data-dense philosophy in `docs/design.md` — Paragraph Large Medium (16/24)
for the contract name column, Paragraph Small Regular (12/18) for the date/type metadata.

## Edge cases

- Zero contracts → `EmptyState` renders instead of `ContractList`/`SummaryCard`'s breakdown
  (summary still shows `total: 0` gracefully, no divide-by-zero anywhere since no percentages
  are computed).
- A contract stuck in `status = 'processing'` for an unusually long time (abandoned tab,
  serverless timeout mid-call) → the row still displays with a `processing` badge; there is no
  automatic timeout-to-error transition in this spec — that's the responsibility of the
  `/process` route's own try/catch in `key-term-extraction-spec.md`, not the dashboard's read
  path.
- Sorting by `name` is a plain lexical sort on `file_name` — no natural/numeric sort handling
  needed at MVP contract volumes.
- User deletes a contract from the results page (see engineering-doc.md §9,
  `DELETE /api/contracts/{id}`) → dashboard list must invalidate `['contracts']` and
  `['contracts', 'summary']` query keys so the deleted row disappears without a manual refresh.

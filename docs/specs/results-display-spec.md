# Spec: Results Display (PDF Viewer + Key Terms Panel)

**PRD component:** E — Results Display
**Priority:** P1 (US-006, FR-06, FR-07)

## User flow

1. On navigating to `/contracts/{id}` (post-processing or reopening from the dashboard), the
   page fetches the contract + its key terms.
2. Two-panel layout renders: PDF viewer (or text-viewer fallback) on the left, key-terms panel
   on the right.
3. Clicking a term's page number scrolls/highlights that page in whichever viewer is active.
4. Clicking a term's "Why?" expander reveals `source_sentence`.
5. Editing a term's value inline saves via the `PATCH` route owned by
   `key-term-extraction-spec.md`.

Acceptance criteria (PRD US-006, FR-06, FR-07): PDF viewer renders all pages, scrollable,
zoomable, highlighted term references are clickable; if Storage is unavailable, a paginated
text viewer parses `[PAGE N]` markers and supports identical page-navigation behavior; both
viewers respond to the same `targetPage` prop/state changes.

## Database

Read-only in this spec: `GET` on `contracts` (for `contract_text`, `file_path` presence) and
`key_terms`. No writes originate here (edits are `key-term-extraction-spec.md`'s route;
feedback is `feedback-spec.md`'s route).

## API / Route Handlers

### `GET /api/contracts/{contractId}`

```ts
// Response 200: {
//   id, contract_type, file_name, page_count, status,
//   signedUrl: string | null,   // null if file_path is null OR Storage read fails
//   contract_text: string
// }
```

```ts
export async function GET(req: NextRequest, { params }: { params: { contractId: string } }) {
  const user = await requireUser(req)
  const contract = await getOwnedContract(params.contractId, user.id) // 404 if missing

  await supabase.from('contracts')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', contract.id) // refresh retention timer on every view

  let signedUrl: string | null = null
  if (contract.file_path) {
    const { data } = await supabase.storage
      .from('contracts')
      .createSignedUrl(contract.file_path, 60 * 60) // 1 hour, per PRD constraint
    signedUrl = data?.signedUrl ?? null
  }

  return NextResponse.json({ ...contract, signedUrl })
}
```

`GET /api/contracts/{contractId}/terms` is specified in `key-term-extraction-spec.md`.

### `DELETE /api/contracts/{contractId}`

Engineering-doc §9 requirement (GDPR — user-initiated deletion of a contract and all associated
data). Not owned by any other spec, so it lives here since the results page is where the delete
action is triggered.

```ts
// Response 204, no body
// Errors: 404 { error: { code: 'not_found' } }  — missing or not owned by user
```

```ts
export async function DELETE(req: NextRequest, { params }: { params: { contractId: string } }) {
  const user = await requireUser(req)
  const contract = await getOwnedContract(params.contractId, user.id) // 404 if missing/not owned

  if (contract.file_path) {
    await supabase.storage.from('contracts').remove([contract.file_path])
  }

  const { error } = await supabase.from('contracts').delete().eq('id', contract.id)
  if (error) return apiError(500, 'delete_failed')

  return new Response(null, { status: 204 })
}
```

`key_terms`, `custom_key_terms`, `chat_sessions`, `chat_messages`, and `user_feedback` all
cascade automatically via `on delete cascade` foreign keys defined in `supabase-schema.sql` — no
application-level cleanup of those tables is needed. Only the Storage object requires an
explicit call since Storage isn't a Postgres foreign key. If the Storage removal fails (e.g.
`file_path` already gone), proceed with the row delete anyway — a dangling Storage object with
no owning row is harmless and gets swept manually if ever noticed; blocking deletion on Storage
succeeding would violate the same non-blocking-Storage principle used at upload time.

**UI trigger:** a "Delete Contract" action in the results page header (next to the disclaimer
banner) opens a confirmation modal ("This permanently deletes the contract, its key terms, and
chat history. This can't be undone.") before calling `DELETE`. On success, redirect to
`/dashboard` and invalidate the `['contracts']` and `['contracts', 'summary']` query keys (see
`dashboard-spec.md`'s corresponding edge case) so the dashboard list reflects the deletion
without a manual refresh. `dashboard-spec.md`'s `ContractRow` also gets a secondary delete
affordance (icon button) that calls the same endpoint directly from the list, with the same
confirmation modal, for users who want to delete without opening the contract first.

## State management

- `useQuery(['contract', id])` and `useQuery(['contract', id, 'terms'])` — both server state
  via TanStack Query, refetched on window focus is disabled here (results are stable once
  processed; edits invalidate explicitly instead).
- `targetPage` lives in Zustand (`store/ui-store.ts`): `{ targetPage: number, setTargetPage:
  (n: number) => void }`. Both `PdfViewer` and `TextViewerFallback` subscribe to it. A key-term
  row's page-number click calls `setTargetPage(n)`; each viewer's `useEffect` on `targetPage`
  scrolls to and highlights that page.

## Components

```
components/results/
├── ContractViewerPanel.tsx    — decides PdfViewer vs TextViewerFallback based on signedUrl presence
├── PdfViewer.tsx              — react-pdf, subscribes to targetPage, renders zoom/scroll controls
├── TextViewerFallback.tsx     — splits contract_text on /\[PAGE (\d+)\]/, renders labelled sections, subscribes to targetPage
├── KeyTermsPanel.tsx          — list of KeyTermRow, confidence-sorted-by-default is NOT required (natural extraction order)
├── KeyTermRow.tsx             — name, editable value, page link (calls setTargetPage), confidence badge
├── SourceSentenceTooltip.tsx  — expandable "Why?" showing source_sentence
├── DisclaimerBanner.tsx       — "This is an AI-assisted review tool, not legal advice..." — always rendered at the top of the results page
└── DeleteContractButton.tsx   — header action, opens ConfirmDeleteModal, calls DELETE /api/contracts/{id} on confirm
components/shared/
└── ConfirmDeleteModal.tsx     — reusable confirmation modal (message prop), used here and by dashboard-spec.md's ContractRow delete affordance
```

`ContractViewerPanel` logic:
```tsx
function ContractViewerPanel({ signedUrl, contractText }: Props) {
  return signedUrl
    ? <PdfViewer url={signedUrl} />
    : <TextViewerFallback text={contractText} />
}
```

**`react-pdf` worker setup (technical requirement):** `react-pdf` wraps `pdfjs-dist`, which
needs its worker script configured before any `<Document>` renders, and must never execute
during SSR (it touches `window`/`Worker`). In `PdfViewer.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()
```

`PdfViewer` must be a Client Component (`'use client'`) for this reason — it cannot be rendered
directly inside the `(dashboard)/contracts/[contractId]/page.tsx` Server Component without being
imported as a client boundary. `ContractViewerPanel` itself can stay a Server Component; it just
imports `PdfViewer` as a client child.

## Design binding

Page layout follows `docs/design.md`'s page canvas (96px vertical / 112px horizontal padding,
40px section gap) with the two panels as a `flex-row` pair inside the content area,
`gap: 24px`. Confidence badges reuse the Semantic Status Badge pattern (§ Reusable Patterns).
Low-confidence rows get a `Yellow 50` row background tint in addition to the badge, per the
State Colors table's "Warning" row.

## Edge cases

- `file_path` is `null` (Storage upload failed at upload time) → `signedUrl` is `null` →
  `TextViewerFallback` renders automatically, no user-facing error (non-blocking per PRD).
- `createSignedUrl` itself fails (e.g. Storage outage after a successful upload) → catch and
  fall back to the text viewer identically; log the failure server-side but don't surface it
  as an error banner — the PRD treats the PDF viewer as best-effort, not required.
- Contract still `status = 'processing'` when the results page is hit directly (e.g. user
  double-navigates) → show the processing indicator (from `key-term-extraction-spec.md`)
  instead of the two-panel layout; poll `GET /api/contracts/{id}` every 2s until `status`
  leaves `'processing'`.
- Very short contracts (1–2 pages) → PDF viewer and text viewer both still render normally;
  no special-casing needed since the layout is scroll-based, not paginated-fixed-height.
- Responsive breakpoint (<768px): panels stack into tabs ("Document" / "Key Terms") rather than
  side-by-side — `targetPage` changes should also auto-switch the active tab to "Document" so
  the click-to-navigate interaction still works on mobile.

## Calibration banner (engineering-doc.md §8)

The monthly offline calibration check (see `infrastructure-spec.md`'s eval pipeline) is not
computed live — it writes its result into a single app-wide config value,
`calibration_status: 'ok' | 'degraded'`, stored as a row in the `app_config` key/value table
(added to `supabase-schema.sql`: `key text primary key, value text not null`) rather than
recomputed per request. `KeyTermsPanel` reads this value once via
`GET /api/config/calibration-status` and renders a dismissible banner above the confidence
scores — *"Our confidence scores are running less accurate than usual this month — verify
low-confidence terms carefully."* — only when `calibration_status = 'degraded'`.

```ts
// app/api/config/calibration-status/route.ts
// No auth required — not user-scoped data, just an app-wide flag
export async function GET() {
  const { data } = await supabaseAdmin
    .from('app_config')
    .select('value')
    .eq('key', 'calibration_status')
    .maybeSingle()

  return NextResponse.json({ calibrationStatus: data?.value ?? 'ok' })
}
```

Uses `supabaseAdmin` (service role) since there's no `user_id` to scope an RLS policy against —
`app_config` has RLS enabled with no policies at all (default-deny), so only the service role
can read/write it; this is intentional, matching the retention-sweep job's use of the service
role in `infrastructure-spec.md`. If no row exists yet, treat as `'ok'` (banner hidden) rather
than erroring — this keeps the banner off by default until an operator manually flips it after
reviewing an eval report.

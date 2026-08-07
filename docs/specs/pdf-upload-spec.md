# Spec: PDF Upload & Text Extraction

**PRD component:** B — PDF Upload & Text Extraction
**Priority:** P0 (US-002, FR-02, FR-03)

## User flow

1. User is on `/upload`, selects contract type (NDA or MSA) from a dropdown.
2. User drags a PDF onto the dropzone or uses the file picker.
3. Client-side pre-check: file extension is `.pdf`, size ≤ 10MB. Files failing this show an
   inline error immediately, no request is sent.
4. On pass, the file is submitted as `multipart/form-data` to `POST /api/contracts`.
5. The Route Handler re-validates size server-side, runs `pdf-parse`, counts pages, rejects if
   > 20 pages, inserts `[PAGE N]` markers into the extracted text, rejects if the resulting
   text is < 100 words (treated as a scanned/image PDF) or the estimated token count exceeds
   15,000.
6. On success, the file is uploaded to Supabase Storage at
   `contracts/{user_id}/{contract_id}/{filename}.pdf`. **This upload is non-blocking** — if it
   fails, `file_path` stays `null`, the contract row is still created, and only the PDF viewer
   is affected (the text-viewer fallback in `results-display-spec.md` still works).
7. The contract row is created with `status = 'pending'`; the client transitions to the
   pre-processing preview (handled in `key-term-extraction-spec.md` / `custom-terms-spec.md`).

Acceptance criteria (PRD US-002, FR-02, FR-03): rejects files > 10MB or > 20 pages with a clear
message; extracts text once at upload and stores it in `contracts.contract_text` so no
downstream step re-reads the file.

## Database

Writes to `contracts` (see `supabase-schema.sql` for the full table). This spec owns the
`INSERT` on upload; `status` transitions to `'completed'`/`'error'` are owned by
`key-term-extraction-spec.md`.

## Token estimation

Use a simple heuristic (no tokenizer library dependency needed at this precision): estimate
`tokens ≈ characters / 4`. Reject if estimate > 15,000. This is intentionally conservative —
being off by a few hundred tokens is acceptable since the real enforcement backstop is
OpenAI's own context limit and the cost ceiling this protects is a soft budget, not a hard API
constraint.

## API / Route Handlers

### `POST /api/contracts`

```ts
// app/api/contracts/route.ts
// Request: multipart/form-data — file: File, contract_type: 'nda' | 'msa'
// Response 201: { id, contract_type, file_name, page_count, status: 'pending' }
// Errors:
//   400 { error: { code: 'file_too_large' } }        — > 10MB
//   400 { error: { code: 'too_many_pages' } }         — > 20 pages
//   400 { error: { code: 'scanned_pdf_unsupported' } } — extracted text < 100 words
//   400 { error: { code: 'contract_too_long' } }       — estimated tokens > 15,000
//   400 { error: { code: 'invalid_contract_type' } }
//   500 { error: { code: 'extraction_failed' } }
```

Implementation outline:
```ts
export async function POST(req: NextRequest) {
  const user = await requireUser(req)              // 401 if absent
  const form = await req.formData()
  const file = form.get('file') as File
  const contractType = form.get('contract_type') as string

  if (!['nda', 'msa'].includes(contractType)) return apiError(400, 'invalid_contract_type')
  if (file.size > 10 * 1024 * 1024) return apiError(400, 'file_too_large')

  const buffer = Buffer.from(await file.arrayBuffer())
  const { text, pageCount } = await extractPdfText(buffer) // lib/pdf/extract.ts

  if (pageCount > 20) return apiError(400, 'too_many_pages')
  if (countWords(text) < 100) return apiError(400, 'scanned_pdf_unsupported')
  if (estimateTokens(text) > 15000) return apiError(400, 'contract_too_long')

  const contractId = crypto.randomUUID()
  const filePath = await uploadToStorageBestEffort(user.id, contractId, file) // null on failure

  const { data, error } = await supabase.from('contracts').insert({
    id: contractId,
    user_id: user.id,
    contract_type: contractType,
    file_name: file.name,
    file_path: filePath,
    contract_text: text,
    page_count: pageCount,
    status: 'pending',
  }).select().single()

  if (error) return apiError(500, 'extraction_failed')
  return NextResponse.json(data, { status: 201 })
}
```

`lib/pdf/extract.ts` responsibility: wrap `pdf-parse`, walk pages, insert `[PAGE N]` before
each page's text so the marker convention is identical to what `contract-chat-spec.md` and
`results-display-spec.md` parse later.

## State management

- Upload progress and the pre-check error are local component state (`useState`) in the
  `Dropzone` component — no server cache involved until the request succeeds.
- On success, the new contract record is written into the TanStack Query cache
  (`queryClient.setQueryData(['contract', id], data)`) so the results/preview page has it
  immediately without a refetch.

## Components

```
app/(dashboard)/upload/page.tsx
components/upload/
├── ContractTypeSelector.tsx   — NDA/MSA dropdown
├── Dropzone.tsx               — drag-drop + file picker, client-side validation, upload progress
```

## Design binding

Dropzone default/hover/error states follow `docs/design.md`'s state-colors table (default:
Grey 100 border; hover: Grey 200; error: Red 500 border + Red 50 background). Error text uses
Paragraph Small Regular (12/18) in Red 700 per the type scale.

## Edge cases

- Corrupted/unparseable PDF → `pdf-parse` throws → caught, returns `500 extraction_failed`
  with "We couldn't read this file — please check it's a valid PDF and try again." No partial
  contract row is persisted (insert only happens after extraction succeeds).
- Non-NDA/MSA content uploaded under an NDA/MSA type selection → PRD explicitly allows this:
  "graceful degradation (still extracts, just may miss domain-specific terms)" — no upload-time
  rejection based on content type, only structural checks (size/pages/word count/tokens).
- Duplicate filename across contracts for the same user → the Storage path is namespaced by
  `contract_id`, so collisions are impossible by construction.
- Storage upload failure (network blip, bucket misconfigured) → contract still saves with
  `file_path = null`; no error surfaced to the user at upload time (per the PRD's non-blocking
  requirement) — the results page silently falls back to the text viewer.

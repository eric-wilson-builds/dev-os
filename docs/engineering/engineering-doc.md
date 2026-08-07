# ContractIQ — Engineering Document

**Version:** 1.0
**Status:** Draft — pending approval
**Source PRD:** `docs/ContractIQ_PRD.md` (v1.0, 2026-06-24)
**Stack:** Next.js 14 (App Router) + Supabase (Auth, Postgres, Storage) + OpenAI GPT-4o

---

## 1. Executive Summary

**Project:** ContractIQ — an AI-assisted contract review tool for Non-Disclosure Agreements
(NDA) and Master Service Agreements (MSA).

**Business goal:** Give SMB founders, operations leads, procurement managers, and freelancers
who have no in-house legal counsel a way to understand what they're signing without paying
$250–$500/hr for a lawyer-reviewed contract.

**Problem statement:** Reviewing a single NDA or MSA manually takes 90–120 minutes and
routinely misses key obligations (auto-renewal, indemnification limits, IP assignment).
Generic AI chat tools produce unstructured summaries with no page reference, no confidence
score, and no schema — so users still can't tell what to trust.

**Target users:**
- **Primary — Time-Pressed Founder/Ops Lead:** 5–250 employee company, no legal counsel, signs
  5–15 NDAs/MSAs per month.
- **Secondary — Freelancer/Consultant:** signs 1–4 client MSAs per month, can't afford legal
  review, uncertain which clauses are non-standard.

**Success criteria (from PRD §3):**
| Metric | Target |
|---|---|
| Upload → completed key-term review (North Star) | ≤ 15 minutes |
| Key-term extraction F1 | ≥ 88% (NDA), ≥ 85% (MSA) |
| Confidence calibration error | ≤ 0.10 per 10%-bucket |
| Time to first extracted key-term display | ≤ 30s P95 (≤20-page contracts) |
| Chat response latency | ≤ 15s P95 |
| Cost per contract analysis | ≤ $0.25 (target $0.20 extraction-only) |
| 30-day retention | ≥ 45% |
| AI correction rate | ≤ 12% of terms |

This document defines the technical architecture required to hit those targets. It is the
authoritative reference for Stage 2 (`docs/specs/*`, `supabase-schema.sql`, `.env.example`) —
no implementation begins until this document is approved.

---

## 2. Product Scope

### In scope (MVP, v0.1–v1.0 per PRD roadmap)
- Email/password auth (Supabase Auth)
- PDF upload (≤10MB, ≤20 pages, ≤15,000 tokens), text-layer PDFs only
- NDA and MSA contract types, English language, US/UK law conventions
- Server-side text extraction with `[PAGE N]` markers, stored once in `contracts.contract_text`
- GPT-4o structured key-term extraction (10–12 standard terms per type) with page number,
  confidence score (0–100%), and verbatim source sentence per term
- Up to 5 user-defined custom key terms per analysis
- Two-panel results page: PDF viewer (primary) / text-viewer fallback (if Storage unavailable)
  + key-terms panel
- Click-to-navigate from key term to PDF page
- Inline term correction (manual edit), original AI value preserved for the feedback loop
- Full-document-context contract chat (GPT-4o), streamed responses, mandatory `[Page X]`
  citation, persistent chat history per contract
- Dashboard: contract history, totals by type, sortable list
- Thumbs up/down feedback + optional comment (P2, backlog for MVP but schema exists day one)
- Row-Level Security across every table; signed URLs (1hr expiry) for Storage

### Out of scope (MVP)
- Scanned/image PDFs (OCR) — graceful rejection only, "Scanned PDFs are not supported yet"
- Non-English contracts, non-US/UK legal conventions
- Contracts > 20 pages / > 15,000 tokens
- CSV/PDF export of results
- Batch upload
- Contract comparison (side-by-side)
- Multi-user workspaces / team seats
- Fine-tuned models (v1 uses few-shot prompting against CUAD + internal labelled sets only)

### Future enhancements (post-v1.0, PRD roadmap v1.1–v1.2)
- v1.1: CSV export, PDF summary export, batch upload (≤5 contracts), dashboard analytics charts
- v1.2: OCR (AWS Textract) for scanned PDFs, contract comparison view, email notifications,
  multi-user workspaces (team plans)

---

## 3. User Personas

| Persona | Role / Context | Permissions | Primary workflows |
|---|---|---|---|
| **Founder / Ops Lead** (primary) | Founder, COO, Procurement Manager, Legal Ops Manager at a 5–250 employee company with no in-house counsel | Standard authenticated user — full access to their own contracts, key terms, chat, feedback | Upload contract → review key terms → verify low-confidence flags → chat for clarification → track review history on dashboard |
| **Freelancer / Consultant** (secondary) | Individual contributor receiving client MSAs | Standard authenticated user (same role/permissions as primary — no tiering at MVP) | Upload received MSA → quickly check non-standard clauses (liability, IP, termination) → chat to understand a specific clause before signing |

There is a **single user role** at MVP. Every table is scoped to `user_id = auth.uid()` via
RLS — there is no admin, reviewer, or team-member role in this version. Multi-user workspaces
are explicitly deferred to v1.2 (PRD roadmap).

---

## 4. User Flows

Format: `User Action → Frontend Behavior → Backend Processing → Database Interaction → System Response`

### Flow 1 — Sign Up → Dashboard

1. User lands on marketing page, clicks **"Get Started Free"**
   → Frontend opens Supabase Auth sign-up form (email + password), client-side validation
   → Backend: Supabase Auth creates the user, issues a session (JWT + refresh token)
   → DB: row created in `auth.users` (managed by Supabase, not app-owned)
   → Response: session cookie set, client redirects to `/dashboard`
2. Dashboard loads with no contracts
   → Frontend: TanStack Query fetches `GET /api/contracts` (empty array)
   → Backend: Route Handler validates session, queries `contracts` filtered by `user_id`
   → DB: `SELECT * FROM contracts WHERE user_id = auth.uid()` returns 0 rows
   → Response: empty-state UI — *"No contracts reviewed yet — upload your first contract to begin."*

### Flow 2 — Sign In → Dashboard

1. User submits email/password on sign-in form
   → Frontend: Supabase client calls `signInWithPassword`
   → Backend: Supabase Auth validates credentials, issues session
   → DB: none (auth-only)
   → Response: on success, redirect to `/dashboard` within 10s (PRD US-001); invalid credentials
     surface a clear inline error
2. Dashboard loads with history
   → Frontend: TanStack Query fetches `GET /api/contracts` + `GET /api/contracts/summary`
   → Backend: Route Handler queries contracts + aggregates count-by-type
   → DB: `SELECT` on `contracts` grouped by `contract_type`, ordered by `created_at DESC LIMIT 5`
   → Response: summary card (total contracts, by-type breakdown, last 5 with status/date) +
     "Review a Contract" CTA

### Flow 3 — Core Flow: Contract Review

1. User clicks **"Review Contract"**, selects contract type (NDA/MSA), uploads a PDF (drag-drop
   or file-picker)
   → Frontend: client-side check on file size (≤10MB) and extension before upload; on pass,
     `POST /api/contracts` (multipart) with contract_type + file
   → Backend Route Handler: validates size/type again server-side (never trust client-only
     checks); runs `pdf-parse` to extract page count + full text with `[PAGE N]` markers
     inserted at each page boundary; rejects if page count > 20 or extracted text < 100 words
     ("Scanned PDFs are not supported yet"); rejects if token estimate > 15,000
     ("Contract exceeds the supported length"); best-effort upload to Supabase Storage
     (`contracts/{user_id}/{contract_id}/{filename}.pdf`) — **non-blocking**: on Storage
     failure, `file_path` stays `null` and only the PDF viewer is affected
   → DB: `INSERT INTO contracts (user_id, contract_type, file_name, file_path, contract_text,
     page_count, status='pending')`
   → Response: contract record returned with `id`; frontend shows the pre-processing preview —
     the standard term list for the selected contract type (10–12 terms), each with an
     "+ Add Key Term" affordance
2. User adds up to 5 custom terms (optional), e.g. "Non-compete radius"
   → Frontend: local state list, each item tagged "Custom"; on submit, `POST
     /api/contracts/{id}/custom-terms` (array, max 5 enforced client + server side)
   → Backend: validates count ≤ 5
   → DB: `INSERT INTO custom_key_terms (contract_id, term_name)` per term
   → Response: preview list re-renders with the custom terms included
3. User clicks **"Process Contract"**
   → Frontend: progress indicator (extracting text ✓ → analyzing with AI → compiling results),
     `POST /api/contracts/{id}/process`
   → Backend: builds the extraction prompt (contract_text + standard term schema for the
     contract type + injected custom terms), calls OpenAI GPT-4o (JSON mode, temp 0.1, max
     2000 output tokens); on OpenAI error, retries with exponential backoff up to 3 attempts;
     on JSON parse failure, sends the single documented retry prompt ("return only the JSON
     array"); on repeated failure, sets `status = 'error'` and surfaces a human-readable retry CTA
   → DB: on success, `UPDATE contracts SET status = 'completed'`; `INSERT INTO key_terms
     (contract_id, term_name, value, page_number, confidence_score, source_sentence, is_custom)`
     for every extracted term (standard + custom)
   → Response: redirect to results page within the 30s P95 budget
4. Results page renders
   → Frontend: two-panel layout — PDF viewer (react-pdf, using the 1hr signed URL if
     `file_path` is set) or text-viewer fallback (parses `[PAGE N]` markers from
     `contract_text`) on the left; key-terms panel on the right (Term | Value | Page |
     Confidence, color-coded green ≥80% / amber 50–79% / red <50%)
   → Backend: `GET /api/contracts/{id}` returns contract + `GET /api/contracts/{id}/terms`
     returns key terms
   → DB: reads only — no writes on page load
   → Response: terms with confidence < 50% render with a ⚠️ non-dismissible tooltip; clicking
     a page number scrolls/highlights the corresponding PDF page; each term has an expandable
     "Why?" showing `source_sentence`
5. User edits a term inline
   → Frontend: inline edit control, on save `PATCH /api/contracts/{id}/terms/{termId}`
   → Backend: validates ownership (`user_id` match via RLS), writes the new value, preserves
     `original_ai_value` if this is the first edit
   → DB: `UPDATE key_terms SET value = ?, edited = true, original_ai_value =
     COALESCE(original_ai_value, value), edited_at = now()`
   → Response: within 2s (PRD US-009); term displays an "Edited" badge

### Flow 4 — Chat with Contract

1. User opens the "Chat with Contract" panel, types a question
   → Frontend: optimistic append of the user message to the TanStack Query cache;
     `POST /api/contracts/{id}/chat` (question text)
   → Backend: fetches `contract_text` (already in DB — no re-fetch from Storage) + full
     message history for the session (ascending, up to 200 messages) + runs the lightweight
     query-classification step (`contract` / `history` / `both`) to adjust the system prompt;
     calls OpenAI GPT-4o with `stream: true`, temp 0.4, max 1000 output tokens, system prompt
     enforcing "answer only from the document text provided; if the answer is not in the
     document, say so"; mandates a `[Page X]` citation in every response
   → DB: on stream completion, `INSERT INTO chat_messages (session_id, role='assistant',
     content, page_citation)`; the user's message was inserted at request start
     (`role='user'`)
   → Response: tokens streamed to the client via `ReadableStream` as they arrive (≤15s P95 to
     first-token-to-completion); the citation renders as a clickable page link
2. User reopens a previously-reviewed contract
   → Frontend: `GET /api/contracts/{id}/chat` on results-page mount
   → Backend: fetches the existing `chat_sessions` row for this contract (or creates one on
     first message) + its `chat_messages` ascending
   → DB: `SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC`
   → Response: prior conversation renders in the chat panel exactly as left (PRD US-012)

---

## 5. Frontend Architecture

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, TanStack Query (server state),
Zustand (local UI state), `react-pdf` (PDF.js wrapper) for the inline viewer.

**Why TanStack Query + Zustand:** Dashboard lists, key-term inline edits, and chat history all
require cache invalidation after writes (e.g., editing a term must immediately reflect in the
panel without a full refetch of unrelated data). TanStack Query owns everything backed by
Supabase (contracts, key terms, chat messages) with mutation-triggered invalidation. Zustand
holds transient UI-only state that doesn't belong in a server cache: the active PDF page,
which panel/tab is open, modal visibility, the in-progress custom-term draft list before
submission.

### UX states
| State | Handling |
|---|---|
| **Loading** | Skeleton loaders on dashboard list and key-terms panel; staged progress indicator during processing (extract → analyze → compile) |
| **Empty** | Dashboard empty state on zero contracts; "no messages yet" placeholder in a fresh chat session |
| **Error** | Upload rejection (size/page/token/scanned-PDF) surfaces inline under the dropzone; OpenAI failure surfaces a banner with a "Try again" CTA (contract `status='error'`, retry re-triggers `/process` without re-upload); Storage-unavailable silently falls back to the text viewer (no user-facing error) |
| **Responsive** | Results page two-panel layout collapses to tabbed single-column below `768px`; dashboard table becomes stacked cards on mobile |
| **Accessibility (WCAG 2.1 AA)** | Confidence color-coding always paired with an icon + text label (never color-only); all interactive elements keyboard-reachable; PDF viewer page controls have `aria-label`s; focus rings visible per PRD's UI consistency baseline |

### Page hierarchy

```
app/
├── (marketing)/
│   └── page.tsx                  — landing page (static)
├── (auth)/
│   ├── sign-up/page.tsx
│   └── sign-in/page.tsx
├── (dashboard)/
│   ├── layout.tsx                 — authenticated shell (nav, user menu)
│   ├── dashboard/page.tsx         — summary card + sortable contract list
│   ├── upload/page.tsx            — contract type selector + upload + pre-processing preview
│   └── contracts/[contractId]/
│       ├── page.tsx               — results page (PDF/text viewer + key-terms panel)
│       └── layout.tsx             — shared header (disclaimer banner, breadcrumb)
```

### Component hierarchy (results page)

```
ContractResultsPage
├── DisclaimerBanner              — "Not legal advice" (always visible)
├── ContractViewerPanel
│   ├── PdfViewer                 — react-pdf, targetPage prop, zoom/scroll
│   └── TextViewerFallback        — renders [PAGE N] sections, same targetPage contract
├── KeyTermsPanel
│   ├── KeyTermRow (× N)          — name, value (editable), page link, confidence badge
│   │   └── SourceSentenceTooltip — expandable "Why?"
│   └── AddCustomTermButton       — pre-processing only
└── ChatPanel (floating / tab)
    ├── MessageList               — streamed assistant messages, page citations
    └── MessageComposer
```

State ownership: `targetPage` lives in the Zustand UI store; both `PdfViewer` and
`TextViewerFallback` subscribe to it so a key-term page-click drives either viewer identically
(PRD FR-06).

---

## 6. Backend Architecture

**Stack:** Next.js 14 Route Handlers (`app/api/**`), deployed on Vercel alongside the frontend
— a single runtime and deploy target, keeping the orchestration layer thin per the PRD's own
architecture note ("no business logic beyond orchestration").

### Core systems

- **Auth:** every Route Handler validates the Supabase session server-side
  (`supabase.auth.getUser()` using the request's cookie-based session); unauthenticated
  requests return `401`. There is no separate app-level auth system — Supabase Auth + RLS is
  the complete authorization boundary.
- **Authorization:** enforced at the database layer via RLS (`auth.uid() = user_id` on every
  table), not hand-rolled in route logic. Route Handlers still filter queries by the
  authenticated user's id defensively, but RLS is the last line of defense against a missed
  filter.
- **Business logic / orchestration:**
  - `lib/pdf/extract.ts` — wraps `pdf-parse`, inserts `[PAGE N]` markers, returns
    `{ text, pageCount }`
  - `lib/openai/extraction.ts` — builds the few-shot extraction prompt (per contract type +
    custom terms), calls OpenAI, validates/parses JSON, retries once on parse failure
  - `lib/openai/chat.ts` — builds the chat prompt (contract text + history + query
    classification), streams the OpenAI response
  - `lib/retry.ts` — shared exponential-backoff helper (3 attempts) wrapping all OpenAI calls
- **Validation:** Zod schemas per route (file size/type, contract type enum, custom term count
  ≤5, message length) — requests failing validation return `400` with a field-level error
- **Middleware:** `middleware.ts` refreshes the Supabase session cookie on every request;
  redirects unauthenticated users away from `(dashboard)` routes at the edge before they reach
  a page component
- **Error handling:** a shared `apiError()` helper normalizes error responses to
  `{ error: { code, message } }`; OpenAI/Storage failures never throw raw provider errors to
  the client — always mapped to a human-readable message + retry affordance (PRD constraint:
  "no silent failures")

### Service interaction

```
Browser (Next.js client)
      │  fetch / streaming fetch
      ▼
Next.js Route Handlers (app/api/**)
      │                     │                      │
      ▼                     ▼                      ▼
Supabase Auth        Supabase Postgres      Supabase Storage
(session validation) (contracts, key_terms,  (PDF file, signed URL,
                       chat_*, feedback —      non-blocking)
                       all RLS-scoped)
      │
      ▼
OpenAI API (GPT-4o)
  - extraction: JSON mode, temp 0.1
  - chat: streamed, temp 0.4
```

The PDF file itself is read **once**, at upload — by the Route Handler that calls
`pdf-parse` — and never downloaded again. Every downstream operation (processing, chat) reads
`contracts.contract_text` from Postgres. Supabase Storage exists solely to power the inline
PDF viewer; its failure is isolated from the AI pipeline (PRD Component B architecture note).

### Reliability
- OpenAI calls: 3 retries with exponential backoff before surfacing an error
- Contract `status` enum (`pending` → `processing` → `completed` | `error`) lets a user retry
  a failed analysis without re-uploading
- 90-day retention: a scheduled job (Vercel Cron calling a Route Handler, or a `pg_cron` job in
  Supabase) sweeps `contracts` where `last_accessed_at < now() - interval '90 days'`, deletes
  the Storage object, and nulls `file_path`/`contract_text` (row retained for dashboard history
  context, content purged) — implementation detail for Stage 2, called out here as an
  architectural requirement

---

## 7. Database Design and Schema

Single Supabase Postgres project. Every table carries its own `user_id` column (not just a
join path to `contracts.user_id`) per PRD FR-13, so RLS policies are a uniform
`auth.uid() = user_id` on each table.

### `contracts`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | |
| `user_id` | `uuid` FK → `auth.users.id`, not null | RLS scope |
| `contract_type` | `enum('nda','msa')` not null | |
| `file_name` | `text` not null | original upload filename |
| `file_path` | `text` nullable | Storage path; null if upload failed (non-blocking) |
| `contract_text` | `text` not null | full text with `[PAGE N]` markers, single source of truth |
| `page_count` | `int` not null | |
| `status` | `enum('pending','processing','completed','error')` default `'pending'` | |
| `last_accessed_at` | `timestamptz` default `now()` | drives 90-day retention sweep |
| `created_at` / `updated_at` | `timestamptz` default `now()` | `updated_at` via trigger |

Indexes: `(user_id)`, `(user_id, created_at desc)` for the dashboard sort.

### `key_terms`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `contract_id` | `uuid` FK → `contracts.id` cascade delete | |
| `user_id` | `uuid` FK → `auth.users.id`, not null | denormalized for RLS |
| `term_name` | `text` not null | |
| `value` | `text` not null | current (possibly edited) value |
| `page_number` | `int` not null | 1-indexed |
| `confidence_score` | `numeric(5,2)` not null | 0–100 |
| `source_sentence` | `text` not null | verbatim, powers the "Why?" tooltip |
| `is_custom` | `boolean` default `false` | |
| `original_ai_value` | `text` nullable | set on first edit, feeds the correction feedback loop |
| `edited` | `boolean` default `false` | |
| `edited_at` | `timestamptz` nullable | |
| `created_at` / `updated_at` | `timestamptz` default `now()` | |

Indexes: `(contract_id)`.

### `custom_key_terms`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `contract_id` | `uuid` FK → `contracts.id` cascade delete | |
| `user_id` | `uuid` FK → `auth.users.id`, not null | |
| `term_name` | `text` not null | user-requested term, pre-processing |
| `created_at` | `timestamptz` default `now()` | |

Constraint: application-enforced max 5 rows per `contract_id` (checked in the Route Handler;
not practical as a raw SQL constraint). Indexes: `(contract_id)`.

### `chat_sessions`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `contract_id` | `uuid` FK → `contracts.id` cascade delete, unique | one session per contract at MVP |
| `user_id` | `uuid` FK → `auth.users.id`, not null | |
| `created_at` | `timestamptz` default `now()` | |

### `chat_messages`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `session_id` | `uuid` FK → `chat_sessions.id` cascade delete | |
| `user_id` | `uuid` FK → `auth.users.id`, not null | |
| `role` | `enum('user','assistant')` not null | |
| `content` | `text` not null | |
| `page_citation` | `int` nullable | parsed `[Page X]` reference on assistant messages |
| `created_at` | `timestamptz` default `now()` | |

Indexes: `(session_id, created_at asc)` for ordered history reads (up to 200 messages).

### `user_feedback`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `contract_id` | `uuid` FK → `contracts.id` cascade delete | |
| `user_id` | `uuid` FK → `auth.users.id`, not null | |
| `rating` | `enum('up','down')` not null | |
| `comment` | `text` nullable | |
| `created_at` | `timestamptz` default `now()` | |

### `term_corrections` (view)

A SQL view, not a table, over `key_terms` — powers the weekly correction-rate check (PRD §8:
"trigger a prompt review if correction rate exceeds 12% of terms in any 7-day window"):

```sql
CREATE VIEW term_corrections AS
SELECT id, contract_id, user_id, term_name, original_ai_value, value AS corrected_value,
       edited_at
FROM key_terms
WHERE edited = true;
```

### Enums

```sql
CREATE TYPE contract_type AS ENUM ('nda', 'msa');
CREATE TYPE contract_status AS ENUM ('pending', 'processing', 'completed', 'error');
CREATE TYPE message_role AS ENUM ('user', 'assistant');
CREATE TYPE feedback_rating AS ENUM ('up', 'down');
```

### Row Level Security

Every table above: `ENABLE ROW LEVEL SECURITY`, with one policy per operation:

```sql
CREATE POLICY "select_own" ON <table> FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON <table> FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON <table> FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_own" ON <table> FOR DELETE USING (auth.uid() = user_id);
```

`term_corrections` inherits RLS from its base table (`key_terms`) automatically since it's a
plain view with no `SECURITY DEFINER`.

### Storage

Bucket: `contracts` (created via `INSERT INTO storage.buckets`, not the dashboard, per PRD
Assumption 13). Path convention: `contracts/{user_id}/{contract_id}/{filename}.pdf`.

```sql
CREATE POLICY "insert_own_contract_files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'contracts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "select_own_contract_files" ON storage.objects FOR SELECT
  USING (bucket_id = 'contracts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "delete_own_contract_files" ON storage.objects FOR DELETE
  USING (bucket_id = 'contracts' AND auth.uid()::text = (storage.foldername(name))[1]);
```

Signed URLs generated on-demand by the Route Handler serving the results page, 1-hour expiry
(PRD constraint). This full schema (tables + enums + RLS + storage policies + triggers) is
the exact scope of the single paste-and-run `supabase-schema.sql` Stage 2 will produce.

---

## 8. AI Architecture

**Provider / model:** OpenAI GPT-4o, called exclusively from Next.js Route Handlers — the API
key is a server-only env var, never exposed to the client.

| Parameter | Extraction | Chat |
|---|---|---|
| Temperature | 0.1 (deterministic) | 0.4 (natural but grounded) |
| Response format | `json_object` (JSON mode) | free text w/ mandatory `[Page X]` citation |
| Max output tokens | 2,000 | 1,000 |
| Context window used | full contract text (≤15k tokens) + few-shot examples | full contract text + up to 200 prior messages, ascending |
| Latency budget | ≤20s P95 per call | ≤20s P95 per call, streamed to reduce perceived latency |

### Prompt strategy
- **Extraction:** few-shot (3 labelled NDA examples, 3 MSA examples embedded in the system
  prompt) targeting the JSON schema `[{ term_name, value, page_number, confidence_score,
  source_sentence }]`. Custom terms are appended zero-shot to the same target list, sharing
  the identical output schema.
- **Confidence scoring:** self-reported by the model within the same JSON object per term — no
  second inference call.
- **Error recovery:** a single automatic retry ("Your previous response was not valid JSON.
  Return only the JSON array, no explanation.") before surfacing a user-facing error.
- **Chat:** Retrieval-free / full-context RAG — the entire `contract_text` plus full
  conversation history (up to 200 messages) is passed on every turn (contracts are ≤15k
  tokens, so no chunking or vector retrieval is needed at MVP). A lightweight
  query-classification step (`contract` / `history` / `both`) adjusts which context is
  emphasized in the system prompt without an extra model call. System prompt: *"Answer only
  from the document text provided. If the answer is not in the document, say so."* Every
  response must include a `[Page X]` citation; "I cannot find this in the document" is a
  valid, expected output — not a failure mode.

### Grounding & hallucination guardrails
- Every extracted term carries `source_sentence` + `page_number` — traceable to source,
  surfaced via the "Why?" tooltip
- Confidence < 50% → non-dismissible ⚠️ warning; term is **never hidden**
- Chat responses are structurally required to cite a page; a regression test asserts
  "I cannot find this" for an out-of-document question
- Monthly calibration check (offline, not part of the live app) verifies predicted confidence
  vs. observed accuracy within ±10%; a UI banner is shown if miscalibration ≥15% (surfaced via
  a `calibration_status` config value, not computed live)

### Token / cost controls
- Contract length hard-capped at 15,000 tokens at upload time (rejected before any OpenAI call
  is made — protects the cost ceiling)
- Custom terms capped at 5 per analysis (context-length control)
- Target cost ≤ $0.20/analysis (extraction) at GPT-4o's $0.005/1k input + $0.015/1k output —
  monitored via the OpenAI usage dashboard; alert at 80% of the monthly budget threshold

### Rate limiting
- Per-user rate limit on `/process` and `/chat` routes (e.g. token-bucket in a
  `lib/rate-limit.ts` backed by a Postgres table or Upstash Redis — decided at Stage 2) to cap
  abuse and keep the system within the "100 concurrent analyses" beta scalability constraint

### Fallback
- 3-retry exponential backoff on any OpenAI failure; on final failure, contract `status` is
  set to `'error'` with a "Try again" CTA — no partial/corrupted output is ever persisted
- If cost or availability of GPT-4o becomes untenable, the PRD names Claude 3.5 or Gemini 1.5
  Pro as the evaluated fallback (not implemented at MVP — `lib/openai/*` is the single
  integration point that would need to swap providers)

---

## 9. API Specification

All routes are Next.js Route Handlers under `app/api/`. Every route requires a valid Supabase
session unless noted; unauthenticated calls return `401 { error: { code: "unauthorized" } }`.

### `POST /api/contracts`
- **Purpose:** upload a contract, extract text, create the `contracts` row
- **Auth:** required
- **Request:** `multipart/form-data` — `file` (PDF), `contract_type` (`nda` | `msa`)
- **Response `201`:** `{ id, contract_type, file_name, page_count, status: "pending" }`
- **Validation:** file ≤10MB, ≤20 pages, extracted text ≥100 words, estimated tokens ≤15,000
- **Errors:** `400` file too large / too many pages / scanned PDF detected / token limit
  exceeded; `500` extraction failure

### `GET /api/contracts`
- **Purpose:** list the authenticated user's contracts (dashboard)
- **Auth:** required
- **Query params:** `sort` (`date` | `name` | `type`), `order` (`asc` | `desc`)
- **Response `200`:** `{ contracts: [{ id, contract_type, file_name, status, created_at }] }`

### `GET /api/contracts/summary`
- **Purpose:** dashboard summary card
- **Auth:** required
- **Response `200`:** `{ total, byType: { nda, msa }, recent: [...5 most recent...] }`

### `GET /api/contracts/{id}`
- **Purpose:** fetch a single contract (results page)
- **Auth:** required (RLS additionally guarantees ownership)
- **Response `200`:** `{ id, contract_type, file_name, page_count, status, signedUrl
  (nullable, 1hr expiry), contract_text }`
- **Errors:** `404` not found / not owned by user

### `DELETE /api/contracts/{id}`
- **Purpose:** user-initiated deletion of a contract and all associated data (GDPR requirement)
- **Auth:** required
- **Response `204`**; cascades to `key_terms`, `custom_key_terms`, `chat_sessions`,
  `chat_messages`, `user_feedback`, and the Storage object

### `POST /api/contracts/{id}/custom-terms`
- **Purpose:** register up to 5 custom key terms before processing
- **Auth:** required
- **Request:** `{ terms: string[] }` (max length 5)
- **Response `201`:** `{ terms: [{ id, term_name }] }`
- **Errors:** `400` if combined with existing custom terms > 5

### `POST /api/contracts/{id}/process`
- **Purpose:** trigger GPT-4o extraction against the stored `contract_text`
- **Auth:** required
- **Request:** none (reads contract + its custom terms server-side)
- **Response `200`:** `{ status: "completed", termCount }` (30s P95 budget)
- **Errors:** `422` contract not in `pending` state; `502` OpenAI failure after 3 retries
  (contract set to `status = 'error'`)

### `GET /api/contracts/{id}/terms`
- **Purpose:** fetch extracted key terms for the results panel
- **Auth:** required
- **Response `200`:** `{ terms: [{ id, term_name, value, page_number, confidence_score,
  source_sentence, is_custom, edited }] }`

### `PATCH /api/contracts/{id}/terms/{termId}`
- **Purpose:** inline correction of an extracted term
- **Auth:** required
- **Request:** `{ value: string }`
- **Response `200`:** updated term, `edited: true`; must complete within 2s
- **Validation:** `value` non-empty

### `POST /api/contracts/{id}/chat`
- **Purpose:** send a chat message, get a grounded streamed response
- **Auth:** required
- **Request:** `{ message: string }`
- **Response:** `text/event-stream` — tokens streamed as they arrive; final event includes the
  parsed `page_citation`
- **Validation:** message non-empty, reasonable max length (e.g. 2,000 chars)
- **Errors:** `502` OpenAI failure after retries; response falls back to a single
  non-streamed error message in the chat UI

### `GET /api/contracts/{id}/chat`
- **Purpose:** load persisted chat history for a contract
- **Auth:** required
- **Response `200`:** `{ sessionId, messages: [{ id, role, content, page_citation,
  created_at }] }` (ascending, up to 200)

### `POST /api/contracts/{id}/feedback`
- **Purpose:** submit thumbs up/down + optional comment
- **Auth:** required
- **Request:** `{ rating: "up" | "down", comment?: string }`
- **Response `201`:** `{ id, rating, comment }`

---

## 10. Feature Breakdown

Phases mirror the PRD's own roadmap (§3). Each maps directly to the P0/P1/P2 story priorities.

### Phase 1 — MVP (PRD v0.1–v1.0, P0/P1 stories)
| Feature | Acceptance criteria | Dependencies |
|---|---|---|
| Auth (sign up/in/out) | Auth completes ≤10s; redirect to dashboard; clear error on invalid creds | Supabase project provisioned |
| PDF upload + text extraction | ≤10MB/≤20pg accepted; scanned PDFs rejected with clear message; text stored with `[PAGE N]` markers | none |
| Key term extraction (standard) | ≥80% of standard terms populated; page + confidence per term | OpenAI API access approved |
| Custom term addition | Up to 5 terms; same output structure as standard terms | Extraction pipeline |
| Confidence scoring + low-confidence warning | Every term shows 0–100%; <50% shows ⚠️ + tooltip, never hidden | Extraction pipeline |
| Page attribution + click-to-navigate | Clicking page number scrolls viewer to that page | PDF viewer or text-viewer fallback |
| Results display (PDF viewer + fallback) | Renders all pages, scroll/zoom; text-viewer fallback if Storage unavailable | Signed URL generation |
| Inline key term editing | Saves ≤2s; "Edited" badge; original AI value preserved | Key terms panel |
| Contract chat | Response ≤15s P95; grounded; mandatory page citation | Full contract text stored |
| Persistent chat history | Reopening a contract reloads prior session | `chat_sessions`/`chat_messages` |
| Dashboard + history | Shows totals, by-type breakdown, sortable list | Contracts table |

### Phase 2 — P2 / v1.1 (Post-launch iteration)
| Feature | Acceptance criteria | Dependencies |
|---|---|---|
| Feedback submission | Thumbs up/down + comment saved to `user_feedback` | Results page |
| CSV/PDF export | Generates + downloads within 5s | Key terms panel |
| Batch upload (≤5 contracts) | Multiple contracts processed in one session | Upload flow |
| Dashboard analytics charts | Contracts-by-month, correction-rate chart | Historical data volume |

### Phase 3 — v1.2 Growth
| Feature | Acceptance criteria | Dependencies |
|---|---|---|
| OCR for scanned PDFs | Scanned PDFs processed via AWS Textract or equivalent | New extraction pipeline branch |
| Contract comparison view | Side-by-side key terms across 2 contracts | ≥2 completed contracts |
| Email notifications | Notify on processing completion | Email service integration |
| Multi-user workspaces | Team plans, shared contract access | New role/permission model, RLS redesign |

---

## 11. Folder Structure

```
contractiq/
├── app/
│   ├── (marketing)/
│   │   └── page.tsx
│   ├── (auth)/
│   │   ├── sign-up/page.tsx
│   │   └── sign-in/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── upload/page.tsx
│   │   └── contracts/[contractId]/page.tsx
│   ├── api/
│   │   └── contracts/
│   │       ├── route.ts                    — POST, GET
│   │       ├── summary/route.ts            — GET
│   │       └── [contractId]/
│   │           ├── route.ts                — GET, DELETE
│   │           ├── process/route.ts        — POST
│   │           ├── custom-terms/route.ts   — POST
│   │           ├── terms/
│   │           │   ├── route.ts            — GET
│   │           │   └── [termId]/route.ts   — PATCH
│   │           ├── chat/route.ts           — POST (stream), GET
│   │           └── feedback/route.ts       — POST
│   ├── layout.tsx
│   └── middleware.ts
├── components/
│   ├── ui/                                 — design-system primitives (buttons, badges, inputs)
│   ├── dashboard/                          — ContractList, SummaryCard
│   ├── upload/                             — Dropzone, ContractTypeSelector, TermPreviewList
│   └── results/                            — PdfViewer, TextViewerFallback, KeyTermsPanel, ChatPanel
├── lib/
│   ├── supabase/
│   │   ├── client.ts                       — browser client
│   │   └── server.ts                       — server/Route Handler client (service role where needed)
│   ├── openai/
│   │   ├── extraction.ts
│   │   └── chat.ts
│   ├── pdf/
│   │   └── extract.ts                      — pdf-parse wrapper, [PAGE N] marker insertion
│   ├── retry.ts
│   ├── rate-limit.ts
│   └── validation/                         — Zod schemas per route
├── store/
│   └── ui-store.ts                         — Zustand: targetPage, active panel, modals
├── types/
│   └── database.ts                         — generated Supabase types
├── docs/
│   ├── ContractIQ_PRD.md
│   ├── engineering/
│   │   └── engineering-doc.md              — this file
│   └── specs/                              — Stage 2 output
├── supabase/
│   └── schema.sql                          — Stage 2 output (tables, RLS, storage)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 12. Naming Conventions

| Category | Convention | Examples |
|---|---|---|
| React components | `PascalCase.tsx` | `KeyTermsPanel.tsx`, `PdfViewer.tsx` |
| Hooks | `useCamelCase.ts` | `useContractQuery.ts`, `useChatStream.ts` |
| Route Handlers | lowercase folder = route segment, `route.ts` | `app/api/contracts/[contractId]/process/route.ts` |
| Lib modules | `kebab-case.ts`, grouped by concern | `lib/openai/extraction.ts`, `lib/rate-limit.ts` |
| Zustand stores | `kebab-case-store.ts`, exported hook `useXStore` | `store/ui-store.ts` → `useUiStore` |
| DB tables | `snake_case`, plural | `contracts`, `key_terms`, `chat_messages` |
| DB columns | `snake_case` | `contract_id`, `confidence_score`, `created_at` |
| DB enums | `snake_case`, singular type name | `contract_type`, `contract_status` |
| Env vars | `SCREAMING_SNAKE_CASE`, prefixed `NEXT_PUBLIC_` only if client-exposed | `OPENAI_API_KEY` (server-only), `NEXT_PUBLIC_SUPABASE_URL` |
| Config files | tool-standard names, unmodified | `next.config.mjs`, `tailwind.config.ts` |
| Test files | co-located or in `tests/`, suffixed `.test.ts` / `.spec.ts` | `extraction.test.ts`, `upload-flow.spec.ts` (Playwright) |

---

## 13. Testing Strategy

| Layer | Framework | Coverage target | Focus |
|---|---|---|---|
| Unit | Vitest | ≥80% on `lib/` modules | Prompt builders, JSON-parse retry logic, token estimation, Zod validation schemas, confidence color-banding logic |
| Integration | Vitest + a dedicated test Supabase project | All Route Handlers | Upload → extraction pipeline against a seeded test project; RLS cross-user access attempts (must fail); term-edit persistence; chat message ordering |
| Component | React Testing Library | Key interactive components | `KeyTermsPanel` low-confidence rendering, inline edit flow, `Dropzone` validation errors |
| E2E | Playwright | Golden paths + edge cases | Sign up → upload → process → results → chat (full Flow 1–4); scanned-PDF rejection; oversized-file rejection; low-confidence warning display; chat "cannot find in document" response |

**Note on evaluation vs. testing:** the PRD's Evaluation Strategy (§10 — F1 against the CUAD +
50-contract labelled set, confidence calibration, chat groundedness scoring) is a **separate
offline eval pipeline**, not part of this application test suite. It runs against the same
`lib/openai/extraction.ts` and `lib/openai/chat.ts` modules but is triggered on a release
cadence (every release / monthly), not in CI on every PR. Stage 2 specs should define this as
its own script (e.g. `scripts/eval/`), decoupled from the Vitest/Playwright suites above.

RLS is treated as a first-class test target: every table's cross-user isolation is verified by
an integration test that attempts to read/write another user's row and asserts a `0`-row
result or a policy rejection — this directly satisfies the PRD's pre-launch security review
requirement (§3 Internal Risks: "Supabase RLS misconfiguration exposing user data").

---

## 14. Specs to Implementation Mapping

| PRD Component | Spec file (Stage 2, `docs/specs/`) | Implementation files |
|---|---|---|
| A — Auth & Session Management | `auth-spec.md` | `app/(auth)/**`, `middleware.ts`, `lib/supabase/*` |
| B — PDF Upload & Text Extraction | `pdf-upload-spec.md` | `app/api/contracts/route.ts`, `lib/pdf/extract.ts` |
| C — Key Term Extraction (OpenAI) | `key-term-extraction-spec.md` | `app/api/contracts/[contractId]/process/route.ts`, `lib/openai/extraction.ts` |
| D — Custom Term Addition | `custom-terms-spec.md` | `app/api/contracts/[contractId]/custom-terms/route.ts`, `components/upload/TermPreviewList.tsx` |
| E — Results Display (PDF Viewer + Key Terms Panel) | `results-display-spec.md` | `components/results/PdfViewer.tsx`, `TextViewerFallback.tsx`, `KeyTermsPanel.tsx` |
| F — Contract Chat (Q&A) | `contract-chat-spec.md` | `app/api/contracts/[contractId]/chat/route.ts`, `lib/openai/chat.ts`, `components/results/ChatPanel.tsx` |
| G — Dashboard & History | `dashboard-spec.md` | `app/(dashboard)/dashboard/page.tsx`, `app/api/contracts/route.ts`, `summary/route.ts` |
| H — Feedback Collection | `feedback-spec.md` | `app/api/contracts/[contractId]/feedback/route.ts` |
| Database (all tables, RLS, storage) | `supabase-schema.sql` (always generated, per `implementation-specs` skill) | `supabase/schema.sql` |
| Environment configuration | `.env.example` (always generated) | root `.env.example` |

Each Stage 2 spec file is expected to be self-contained per the `implementation-specs` skill:
user flow, DB schema slice, DB tasks, API routes, state management, component spec, design
binding (via `docs/design.md` in Stage 4), and edge cases — derived entirely from this
document without needing to re-read the PRD.

---

## Open items carried into Stage 2

- Exact rate-limiting backend (Postgres-table token bucket vs. Upstash Redis) — either
  satisfies the PRD's constraint; decide based on whichever adds less operational surface
- 90-day retention sweep mechanism (Vercel Cron vs. `pg_cron`) — both viable, pick based on
  Stage 2's deployment specifics
- Query-classification step for chat (`contract`/`history`/`both`) — PRD specifies it adjusts
  the system prompt "without an extra API call"; Stage 2 should define the exact heuristic
  (keyword-based vs. a cheap classification pass folded into the same prompt)

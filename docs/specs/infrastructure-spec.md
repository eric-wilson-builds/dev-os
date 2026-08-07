# Spec: Cross-Cutting Infrastructure

Covers the shared concerns referenced across every feature spec but not owned by any single
one: rate limiting, retry/backoff, the 90-day retention sweep, request validation, error
response conventions, accessibility, the offline eval pipeline, and type generation. This spec
resolves the three "Open items carried into Stage 2" from `docs/engineering/engineering-doc.md`
plus the cross-cutting requirements from §5, §6, and §13 that no single feature spec owns.

## Rate limiting

**Decision:** Postgres-table token bucket via the `rate_limit_events` table (see
`supabase-schema.sql`) — no external service (Redis/Upstash) is introduced, keeping the
operational surface at exactly one backing store (Supabase) as the PRD's cost-consciousness
favors.

**Scope:** applied to `/api/contracts/{id}/process` and `/api/contracts/{id}/chat` — the two
routes that call OpenAI and are the actual cost/abuse surface.

**Limits:** 10 `process` calls per user per hour; 30 `chat` messages per user per hour. These
are generous relative to the PRD's usage assumptions (5–15 contracts/month, occasional chat
bursts) and exist to catch runaway/abusive usage, not to constrain normal use.

```ts
// lib/rate-limit.ts
export async function checkRateLimit(userId: string, routeKey: 'process' | 'chat') {
  const limit = routeKey === 'process' ? 10 : 30
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { count } = await supabaseAdmin
    .from('rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('route_key', routeKey)
    .gte('created_at', windowStart)

  if ((count ?? 0) >= limit) {
    throw new RateLimitError(`Too many ${routeKey} requests — try again later`)
  }

  await supabaseAdmin.from('rate_limit_events').insert({ user_id: userId, route_key: routeKey })
}
```

Called at the top of `/process` and `/chat` Route Handlers, right after `requireUser()`. On
`RateLimitError`, respond `429 { error: { code: 'rate_limited', message } }`. Old rows can be
pruned by the same retention sweep job below (delete `rate_limit_events` older than 24 hours)
to keep the table small.

## Retry / backoff (shared helper)

```ts
// lib/retry.ts
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (i < attempts - 1) await sleep(2 ** i * 1000) // 1s, 2s, 4s
    }
  }
  throw lastError
}
```

Used by `lib/openai/extraction.ts` (wraps the completion call) and `lib/openai/chat.ts` (wraps
the initial connection to OpenAI's streaming endpoint — once tokens start flowing, a mid-stream
failure is handled by the catch path documented in `contract-chat-spec.md`, not retried, since
partial output can't be safely re-requested from the start without duplicating cost).

## 90-day retention sweep

**Decision:** Vercel Cron calling a Route Handler — chosen over `pg_cron` because the app is
already deployed on Vercel and this avoids enabling a Postgres extension solely for one
scheduled task; the cron trigger and the sweep logic live in the same codebase as everything
else.

```json
// vercel.json
{
  "crons": [{ "path": "/api/cron/retention-sweep", "schedule": "0 3 * * *" }]
}
```

```ts
// app/api/cron/retention-sweep/route.ts
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: stale } = await supabaseAdmin
    .from('contracts')
    .select('id, user_id, file_path')
    .lt('last_accessed_at', cutoff)
    .not('file_path', 'is', null)

  for (const contract of stale ?? []) {
    await supabaseAdmin.storage.from('contracts').remove([contract.file_path!])
    await supabaseAdmin.from('contracts')
      .update({ file_path: null, contract_text: '[deleted — retention period expired]' })
      .eq('id', contract.id)
  }

  await supabaseAdmin
    .from('rate_limit_events')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  return NextResponse.json({ swept: stale?.length ?? 0 })
}
```

This uses `SUPABASE_SERVICE_ROLE_KEY` (server-only, bypasses RLS) since it operates across all
users' data — the only Route Handler in the app that needs the service role instead of the
user's own session. Row is retained (for dashboard history continuity) but its content is
purged; `last_accessed_at` is refreshed on every results-page view (see
`results-display-spec.md`'s `GET /api/contracts/{id}`), so actively-reviewed contracts never
age out.

## Request validation (Zod)

Engineering-doc §6 calls for "Zod schemas per route (file size/type, contract type enum, custom
term count ≤5, message length)". Each feature spec's Route Handler samples show the validation
logic inline as plain `if` checks for readability — implement those checks as the Zod schemas
below instead, kept centrally in `lib/validation/` so every route shares one source of truth
for its request shape and error codes.

```ts
// lib/validation/contracts.ts
import { z } from 'zod'

export const uploadContractSchema = z.object({
  contract_type: z.enum(['nda', 'msa'], { errorMap: () => ({ message: 'invalid_contract_type' }) }),
})
// file itself is validated imperatively (size/page/word/token checks require reading the
// file), not via Zod — Zod covers the form fields only.

export const customTermSchema = z.object({
  term_name: z.string().trim().min(1, 'invalid_term_name').max(100, 'invalid_term_name'),
})

export const patchTermSchema = z.object({
  value: z.string().trim().min(1, 'invalid_value'),
})

export const chatMessageSchema = z.object({
  message: z.string().trim().min(1, 'invalid_message').max(2000, 'invalid_message'),
})

export const feedbackSchema = z.object({
  rating: z.enum(['up', 'down'], { errorMap: () => ({ message: 'invalid_rating' }) }),
  comment: z.string().trim().max(2000).optional(),
})

export const contractListQuerySchema = z.object({
  sort: z.enum(['date', 'name', 'type']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
})
```

Shared parsing helper so every route maps a failed `safeParse` to the same `400` shape used
everywhere else:

```ts
// lib/validation/parse.ts
import { ZodSchema } from 'zod'
import { apiError } from '@/lib/api-error'

export function parseOrError<T>(schema: ZodSchema<T>, data: unknown) {
  const result = schema.safeParse(data)
  if (!result.success) {
    const code = result.error.issues[0]?.message ?? 'validation_error'
    return { data: null, error: apiError(400, code) }
  }
  return { data: result.data, error: null }
}
```

Route Handlers call `const { data, error } = parseOrError(schema, body); if (error) return error`
immediately after `requireUser()` — this replaces the ad-hoc `if (!value?.trim())`-style checks
shown in the per-feature specs; those inline checks describe the *rule*, this is the
*implementation* of that rule.

## Error response convention

Every Route Handler returns errors in one shape, via a shared helper:

```ts
// lib/api-error.ts
export function apiError(status: number, code: string, message?: string) {
  return NextResponse.json({ error: { code, message: message ?? defaultMessage(code) } }, { status })
}
```

No Route Handler should let a raw provider error (OpenAI SDK error, Supabase Postgres error,
Storage error) reach the client directly — always caught and mapped through `apiError()`. This
satisfies the PRD's "no silent failures" reliability constraint uniformly across every route
rather than each spec re-inventing its own error shape.

## Auth guard helper

```ts
// lib/auth/require-user.ts
export async function requireUser(req: NextRequest) {
  const supabase = createServerClient(/* ... */)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new UnauthorizedError()
  return user
}
```

Every feature spec's Route Handlers call this first; a thrown `UnauthorizedError` is caught by
a shared wrapper (or Next.js's route-level error boundary) and converted to `401`. This is the
single implementation referenced as `requireUser()` throughout `pdf-upload-spec.md`,
`key-term-extraction-spec.md`, `custom-terms-spec.md`, `results-display-spec.md`,
`contract-chat-spec.md`, `dashboard-spec.md`, and `feedback-spec.md` — implement once here.

## Accessibility (WCAG 2.1 AA)

Engineering-doc §5's UX states table requires this across every page — called out here since no
single feature spec owns it. Applies to `pdf-upload-spec.md`, `key-term-extraction-spec.md`,
`results-display-spec.md`, `contract-chat-spec.md`, and `dashboard-spec.md` equally:

- **Never color-only:** every semantic-status use (confidence badges, contract status badges,
  feedback thumbs) pairs its color with an icon and a text label. Concretely: confidence badges
  render `⚠️ Low (42%)` / `✓ High (91%)`, not a bare colored dot; contract status badges render
  the status word, not just a colored pill.
- **Keyboard reachability:** every interactive element (dropzone, custom-term add/remove,
  key-term inline edit, page-number links, chat composer, feedback thumbs, delete confirmation)
  must be a real `<button>`/`<a>`/`<input>` or carry `tabIndex={0}` + `role` + `onKeyDown`
  handling Enter/Space if it isn't natively focusable. No `<div onClick>` interactive controls.
- **PDF viewer controls:** zoom in/out, page-forward/back, and the react-pdf container itself
  carry `aria-label`s (`"Zoom in"`, `"Next page"`, `"Contract document, page {n} of {total}"`).
  `TextViewerFallback`'s page sections carry `aria-label="Page {n}"` on each section so the same
  screen-reader navigation story holds for both viewers.
- **Focus rings:** never suppress the browser default focus outline (`outline: none` without a
  replacement) — use Tailwind's `focus-visible:ring-2 focus-visible:ring-cyan-400` (matching the
  landing page's accent color from `contractiq/app/globals.css`) consistently across
  `components/ui/` primitives so focus is always visible when navigating by keyboard.

## Offline evaluation pipeline (engineering-doc.md §13)

Distinct from the Vitest/Playwright suites (Stage 5) — this is the F1/calibration/groundedness
eval against the CUAD + labelled-contract set, run on a release cadence rather than per-PR.
Lives outside `app/` and `lib/` since it's a standalone script, not app runtime code:

```
scripts/eval/
├── run.ts              — entrypoint: loads the labelled test set, calls lib/openai/extraction.ts
│                          and lib/openai/chat.ts directly (same modules the app uses, no HTTP
│                          layer), compares output to labels
├── fixtures/            — labelled NDA/MSA test contracts (CUAD subset + internal SME-labelled)
└── report.ts            — computes per-term F1, confidence calibration error (predicted vs.
                            observed accuracy per 10%-bucket), writes a summary to stdout/JSON
```

`report.ts`'s calibration output is what a human (not the app) uses to decide whether to update
the `app_config.calibration_status` row referenced in `results-display-spec.md`'s calibration
banner — `scripts/eval/` never writes to the app's database directly; updating
`calibration_status` is a manual/ops step after reviewing a report showing ≥15% miscalibration.
Run via `npm run eval` (add to `package.json` scripts), not part of `npm test` or CI.

## Type generation

`types/database.ts` (referenced in the folder structure) is generated, not hand-written:

```bash
npx supabase gen types typescript --project-id <project-ref> --schema public > types/database.ts
```

Re-run after every `supabase-schema.sql` change. Every `lib/supabase/client.ts` /
`lib/supabase/server.ts` client factory should be parameterized as
`createBrowserClient<Database>(...)` / `createServerClient<Database>(...)` using this generated
`Database` type so Supabase query results are typed end-to-end.

## Edge cases

- Rate limit table growth: pruned daily by the retention sweep (24h window), so it never grows
  unbounded even under heavy usage.
- Cron endpoint hit without the correct `CRON_SECRET` → `401`, no data touched — protects
  against the retention sweep being triggered by anyone who discovers the route path.
- Retention sweep runs while a user is actively viewing a contract that's exactly at the 90-day
  boundary → harmless race; worst case the user's next view re-triggers extraction from scratch
  (contract_text is gone) — acceptable given 90 days of inactivity is required to reach this
  state at all, and `last_accessed_at` updates on every view specifically to avoid this for
  active users.

# ContractIQ — Security Plan

Audit and remediation performed by `/security-foundation` against the live codebase (RLS
policies, API routes, `lib/openai/*`, `lib/db/*`, auth pages). Baseline was already solid —
every table had RLS with owner-only policies, every route called `requireUser()` and re-scoped
queries by `user_id`, Zod validated every request body, and secrets were already correctly
split between server-only and `NEXT_PUBLIC_*`. The issues below are what was missing or wrong
on top of that baseline.

## Issues found and fixed

| # | Issue | Severity | Fix |
|---|---|---|---|
| 1 | `rate_limit_events` RLS granted authenticated users `select`/`insert`/`delete` on their own rows. Since rate limiting only *reads* this table, a user could call the Supabase client directly from the browser (their own JWT) and `DELETE FROM rate_limit_events WHERE user_id = auth.uid()` to erase their own throttle history — a full rate-limit bypass. | High | Dropped all three policies. RLS enabled + zero policies = default-deny for every role except `service_role`, which the rate limiter already used exclusively. `supabase/rls-policies.sql`, synced into `database.sql` and `docs/specs/supabase-schema.sql`. |
| 2 | `POST /api/contracts/{id}/chat` had no prompt-injection screening on the user-typed message before it reached GPT-4o. | Medium | `lib/security/promptInjectionGuard.ts` — `sanitizeForLLM()` blocks the message with `400 prompt_injection` before any OpenAI call if it matches known injection patterns (ignore-instructions, reveal-system-prompt, role-override, jailbreak, etc.). |
| 3 | Contract text and chat responses are grounded in *uploaded document content*, which is untrusted — a contract could contain adversarial text instructing the model to ignore its rules. `sanitizeForLLM()` can't be applied to contract text (a real contract legitimately containing "act as independent contractors" would be false-flagged and rejected, breaking the product). | Medium | Hardened the system prompts in `lib/openai/chat.ts` and `lib/openai/extraction.ts` to explicitly tell the model the contract text is untrusted *content*, not instructions, and that any instruction-like text found in it must be treated as data to quote/analyze, never followed. |
| 4 | `POST /api/contracts/{id}/chat` didn't check `contract.status === 'completed'` before allowing chat — a contract still `pending`/`processing`/`error` (key terms not yet extracted, or extraction failed) could still be chatted against. | Low | Added the status check in the route, right after ownership verification, returning `422 invalid_state`. |
| 5 | File upload (`POST /api/contracts`) validated only size and `instanceof File` — no extension or MIME-type check. Anything that passed `pdf-parse` (or failed into a generic `extraction_failed`) was implicitly the only gate. | Medium | `lib/security/inputValidator.ts` — `validateFileUpload()` checks a blocklist (`.exe .js .mjs .cjs .php .zip .sh .bat .cmd .py .rb .ps1`) then an allowlist (`.pdf` only, matching this app's actual scope) then MIME type (`application/pdf`), before size. Wired into the upload route ahead of the `pdf-parse` call. |
| 6 | No rate limit on `POST /api/contracts` (upload) at all. `/process` and `/chat` limits existed but used one hardcoded 1-hour window for both, looser than warranted for the OpenAI-cost surface. | Medium | New `lib/security/rateLimiter.ts` (replaces `lib/rate-limit.ts`) with per-action windows: `chat` 30/min, `process` 5/hour, `upload` 20/day. `429` responses now carry a `Retry-After` header. |
| 7 | `GET .../chat` and the chat POST's history fetch (`getMessages`) pulled **every** stored message for a session on every single turn, unbounded, just to slice the last 10–20 client-side for the prompt. A very long-running session forces an ever-growing row fetch on every turn. | Low | Added `getRecentMessages(sessionId, limit)` in `lib/db/chat.ts` — capped via `MAX_CHAT_HISTORY` (env var, default 200) — used only for the prompt-building path in the chat route. `GET .../chat` still uses the uncapped `getMessages()`, since it must return full history for display per the feature spec. |
| 8 | Login (`AuthForm.tsx`) and logout (`SignOutButton.tsx`) called `supabase.auth.signInWithPassword` / `signOut` directly from the browser. Functionally fine with `@supabase/ssr`'s browser client, but left no server-side seam to rate-limit or audit login attempts, and diverged from the skill's required pattern. | Low | Added `app/api/auth/login/route.ts` and `app/api/auth/logout/route.ts` (server-side, cookies set via `createClient()`). `AuthForm.tsx`'s sign-in branch and `SignOutButton.tsx` now call these instead of the SDK directly. Sign-up was left client-side (out of the two explicit deliverables; its "check your email" flow is materially simpler to keep there). |
| 9 | Unauthenticated users hitting `/sign-in` or `/sign-up` while already logged in weren't redirected to `/dashboard`. | Low | `middleware.ts` now redirects authenticated users away from both auth pages. |
| 10 | Magic numbers (`MAX_FILE_BYTES`, `MAX_PAGES`, `MIN_WORDS`, `MAX_TOKENS`) were duplicated inline in the upload route instead of centralized. | Low (hygiene) | Consolidated into `lib/security/tokenLimiter.ts`, imported everywhere they're used. |

## Deliberate non-fixes (documented, not bugs)

- **Auth rate limiting (10 req/min) is not enforced via `rate_limit_events`.** That table's
  `user_id` column is `NOT NULL references auth.users(id)` — a failed or pre-authentication
  login attempt has no valid user id to key on, so it structurally cannot be logged there
  without a schema change. Auth-endpoint rate limiting should be enabled via **Supabase
  Dashboard → Authentication → Rate Limits** (IP-based, applies before the app is ever
  reached) instead. **Action needed from you:** confirm this is enabled in the Supabase
  dashboard for your project.
- **`MAX_PAGE_COUNT` stays at 20, not the generic 200** some rate-limit guidance suggests.
  `pdf-upload-spec.md` intentionally caps contracts at 20 pages / 15,000 tokens as a cost
  control; loosening it to 200 would be a regression dressed up as a "fix."
- **File type allowlist is `.pdf` only**, not `.pdf` + `.docx`. This app's spec (`pdf-upload-spec.md`)
  never supported `.docx` — added support for it wasn't in scope of a security pass.

## Files created

```
lib/security/authGuard.ts            requireAuth() — re-exports lib/auth/require-user.ts's requireUser()
lib/security/rateLimiter.ts          checkRateLimit() — chat/process/upload sliding windows, service-role only
lib/security/promptInjectionGuard.ts sanitizeForLLM() — blocks known injection patterns in user chat messages
lib/security/tokenLimiter.ts         MAX_FILE_BYTES, MAX_PAGE_COUNT, MIN_EXTRACTED_WORDS, MAX_CONTRACT_TOKENS, MAX_MESSAGE_LENGTH, MAX_CHAT_HISTORY
lib/security/chatSecurity.ts         verifyContractOwnership(), verifySessionOwnership()
lib/security/inputValidator.ts       validateFileUpload() + re-exports lib/validation/contracts.ts's Zod schemas
lib/validation/auth.ts               loginSchema
app/api/auth/login/route.ts          Server-side signInWithPassword
app/api/auth/logout/route.ts         Server-side signOut
supabase/rls-policies.sql            Paste-and-run: fixes rate_limit_events policies, restates all other RLS
docs/security/security-plan.md       This file
```

## Files modified

```
lib/api-error.ts                                        apiError() takes optional headers; RateLimitError carries retryAfterSeconds; new error codes
lib/db/chat.ts                                           + getRecentMessages()
lib/openai/chat.ts                                       System prompt: contract text is untrusted content, not instructions
lib/openai/extraction.ts                                 Same hardening for term extraction
app/api/contracts/route.ts                                Upload: file validation, rate limit, centralized constants
app/api/contracts/[contractId]/process/route.ts            Rate limiter import path, Retry-After header
app/api/contracts/[contractId]/chat/route.ts                Prompt injection check, status check, ownership helpers, capped history, Retry-After header
components/auth/AuthForm.tsx                              Sign-in posts to /api/auth/login
components/auth/SignOutButton.tsx                         Posts to /api/auth/logout
middleware.ts                                             Redirect authenticated users off /sign-in, /sign-up
database.sql, docs/specs/supabase-schema.sql               rate_limit_events RLS fix synced into both schema copies
.env.example                                              + MAX_CHAT_HISTORY
```

## Files deleted

```
lib/rate-limit.ts   superseded by lib/security/rateLimiter.ts
```

## SQL to run

Paste `supabase/rls-policies.sql` into the Supabase SQL Editor. It's idempotent — safe to run
on the existing project. The only functional change versus what's already deployed is that
`rate_limit_events` loses its three user-facing policies (defense-in-depth; the app never relied
on them since the rate limiter already used the service-role client).

## Environment variables to add

`MAX_CHAT_HISTORY` — optional, defaults to `200` if unset. Add to `.env.local` only if you want
a different cap on how many prior messages are pulled into the chat prompt per turn.

## Outstanding / operator action items

1. Confirm in the Supabase dashboard: email verification on, password reset flow on, refresh
   token rotation on (Authentication → Providers / Sessions), and auth-endpoint rate limits on
   (Authentication → Rate Limits) — see "Deliberate non-fixes" above.
2. `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` were already correctly server-only (no
   `NEXT_PUBLIC_` prefix) and `createAdminClient()` was already the only place the service-role
   key gets used — no change needed, confirmed clean.

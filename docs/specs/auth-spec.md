# Spec: Authentication & Session Management

**PRD component:** A — User Authentication & Session Management
**Priority:** P0 (US-001, FR-01)

## User flow

1. Visitor lands on `/` (marketing page), clicks **Get Started Free** → navigates to
   `/sign-up`.
2. User enters email + password, submits.
3. Supabase Auth creates the user and issues a session; the Next.js client stores the session
   via `@supabase/ssr` cookie-based storage.
4. User is redirected to `/dashboard`.
5. Returning users repeat the same flow via `/sign-in` (`signInWithPassword`).
6. Sign-out clears the session and redirects to `/`.

Acceptance criteria (PRD US-001): auth flow completes within 10 seconds; success redirects to
`/dashboard`; invalid credentials show a clear inline error; no dashboard route is reachable
without a valid session.

## Database

No app-owned tables — Supabase manages `auth.users`. Every other table's `user_id` column is a
foreign key to `auth.users(id)` (see `supabase-schema.sql`). No DB migration work in this spec
beyond what's already in the schema file.

## API / Route Handlers

Auth itself is handled client-side via the Supabase JS SDK (`supabase.auth.signUp`,
`signInWithPassword`, `signOut`) — there is no custom `/api/auth/*` route. The one piece of
custom backend logic is `middleware.ts`.

**Package version note:** `@supabase/ssr` `^0.5.1` (pinned in `package.json`) removed the
single-cookie `get`/`set`/`remove` callback shape — `createServerClient` now requires the
batched `getAll`/`setAll` shape below. Do not use the older per-cookie callbacks; they throw at
runtime against this package version.

```ts
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PREFIXES = ['/dashboard', '/upload', '/contracts']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix)
  )

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

The `setAll` re-creating `response` (rather than mutating the original) is required so refreshed
auth cookies actually reach the browser — a common bug is calling `response.cookies.set()`
without first re-issuing `NextResponse.next({ request })` with the updated request, which causes
session refresh to silently no-op.

`lib/supabase/client.ts` (`createBrowserClient`) and `lib/supabase/server.ts`
(`createServerClient` using `next/headers` `cookies()`) are the two client factories every other
spec's Route Handlers and Client Components import — `client.ts` for the browser, `server.ts`
for Route Handlers and Server Components. Neither duplicates the cookie-handling logic above;
that logic is specific to middleware because middleware reads/writes the request object directly
instead of `next/headers`.

Every Route Handler under `app/api/**` additionally calls `supabase.auth.getUser()` at the top
(via the shared `requireUser()` helper in `infrastructure-spec.md`) and returns
`401 { error: { code: "unauthorized", message: "..." } }` if there is no user — this is a
defensive second check, not a replacement for RLS.

## State management

- No TanStack Query needed for auth state itself — the Supabase client's `onAuthStateChange`
  listener drives a small Zustand slice (`store/auth-store.ts`) holding `{ user, isLoading }`,
  consumed by the dashboard layout to show the user menu / trigger sign-out.
- Form state (email/password inputs, validation errors) is local `useState` in the sign-up/
  sign-in Client Components — no global store needed for this.

## Components

```
app/(auth)/
├── sign-up/page.tsx      — email/password form, calls supabase.auth.signUp
└── sign-in/page.tsx      — email/password form, calls supabase.auth.signInWithPassword
components/auth/
├── AuthForm.tsx           — shared form (mode: 'sign-up' | 'sign-in'), inline error display
└── SignOutButton.tsx      — calls supabase.auth.signOut(), redirects to '/'
```

## Design binding

Follow `docs/design.md` form conventions once written: inputs use the `6px` radius / border
token states table (default / focus / error), primary CTA uses Primary Blue `★500`
(`#115ACB`), error text uses Red `700` on Red `50` background per the Reusable Patterns section.

## Edge cases

- Duplicate email sign-up → Supabase returns a conflict error; show "An account with this
  email already exists — sign in instead" with a link to `/sign-in`.
- Weak password → surface Supabase's password policy error inline, don't attempt custom
  validation beyond what Supabase enforces.
- Session expiry mid-session (e.g. long-idle tab) → any Route Handler call returning `401`
  should trigger a client-side redirect to `/sign-in` with a "Your session expired, please
  sign in again" toast, not a silent failure.
- Email verification: PRD Flow 1 mentions "Email Verification" between sign-up and dashboard
  redirect — if Supabase email confirmation is enabled on the project, the sign-up success
  state must show "Check your email to confirm your account" instead of an immediate redirect;
  this is a project-level Supabase Auth setting, not app code, and should be confirmed during
  Stage 3 setup.

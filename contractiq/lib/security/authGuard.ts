/**
 * Canonical auth-guard entrypoint for Route Handlers. Delegates to lib/auth/require-user.ts,
 * which every existing route already imports as `requireUser` — kept as a thin re-export here
 * (rather than duplicated logic) so lib/security/ is a complete, self-contained index of every
 * security control without forcing a mechanical import rewrite across every route.
 */
export { requireUser as requireAuth } from '@/lib/auth/require-user'

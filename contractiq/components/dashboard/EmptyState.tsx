import { LinkButton } from '@/components/ui/Button'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-6 rounded-lg border border-grey-100 bg-white px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-grey-50 text-grey-400">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-body-lg text-grey-500">
        No contracts reviewed yet — upload your first contract to begin.
      </p>
      <LinkButton href="/upload">Review a Contract</LinkButton>
    </div>
  )
}

'use client'

import { useUiStore } from '@/store/ui-store'

export function PageCitationLink({ page }: { page: number }) {
  const setTargetPage = useUiStore((s) => s.setTargetPage)
  const setActivePanel = useUiStore((s) => s.setActivePanel)

  return (
    <button
      type="button"
      onClick={() => {
        setTargetPage(page)
        setActivePanel('viewer')
      }}
      className="inline-flex items-center gap-1 rounded-sm border border-blue-200 bg-blue-50 px-2 py-0.5 text-body-sm font-medium text-blue-700 hover:bg-blue-100"
    >
      Page {page}
    </button>
  )
}

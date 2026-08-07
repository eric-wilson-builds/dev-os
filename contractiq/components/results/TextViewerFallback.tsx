'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useUiStore } from '@/store/ui-store'

interface Page {
  page: number
  content: string
}

export function TextViewerFallback({ text }: { text: string }) {
  const targetPage = useUiStore((s) => s.targetPage)
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const pages = useMemo<Page[]>(() => {
    const parts = text.split(/\[PAGE (\d+)\]/)
    const result: Page[] = []
    for (let i = 1; i < parts.length; i += 2) {
      result.push({ page: Number(parts[i]), content: parts[i + 1]?.trim() ?? '' })
    }
    return result
  }, [text])

  useEffect(() => {
    if (targetPage && pageRefs.current[targetPage]) {
      pageRefs.current[targetPage]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [targetPage])

  return (
    <div className="h-[calc(100vh-320px)] overflow-y-auto rounded-lg border border-grey-100 bg-white p-6">
      {pages.map(({ page, content }) => (
        <div
          key={page}
          ref={(el) => {
            pageRefs.current[page] = el
          }}
          className={`mb-6 rounded p-3 ${targetPage === page ? 'bg-yellow-50 ring-2 ring-blue-500' : ''}`}
        >
          <p className="mb-2 text-body-sm font-medium text-grey-500">Page {page}</p>
          <p className="whitespace-pre-wrap text-body-lg text-grey-900">{content}</p>
        </div>
      ))}
    </div>
  )
}

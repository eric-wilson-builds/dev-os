'use client'

import { useState } from 'react'

export function SourceSentenceTooltip({ sourceSentence }: { sourceSentence: string }) {
  const [open, setOpen] = useState(false)

  if (!sourceSentence) return null

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-fit text-body-sm text-blue-700 hover:underline"
      >
        {open ? 'Hide source' : 'Why?'}
      </button>
      {open && (
        <p className="rounded border border-grey-100 bg-grey-25 px-3 py-2 text-body-sm text-grey-500">
          “{sourceSentence}”
        </p>
      )}
    </div>
  )
}

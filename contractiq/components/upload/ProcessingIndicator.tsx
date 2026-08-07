'use client'

import { useUiStore } from '@/store/ui-store'

const STEPS = [
  { key: 'extracting', label: 'Extracting text' },
  { key: 'analyzing', label: 'Analyzing with AI' },
  { key: 'compiling', label: 'Compiling results' },
] as const

export function ProcessingIndicator() {
  const processingStep = useUiStore((s) => s.processingStep)
  const currentIndex = STEPS.findIndex((step) => step.key === processingStep)

  return (
    <ol className="flex flex-col gap-3">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex
        const isActive = i === currentIndex

        return (
          <li key={step.key} className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-body-sm ${
                isDone
                  ? 'bg-green-500 text-white'
                  : isActive
                    ? 'bg-blue-500 text-white'
                    : 'bg-grey-50 text-grey-400'
              }`}
            >
              {isDone ? '✓' : i + 1}
            </span>
            <span className={`text-body-lg ${isActive || isDone ? 'text-grey-900' : 'text-grey-400'}`}>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

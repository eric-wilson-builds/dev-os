'use client'

import { useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/Button'

interface MessageComposerProps {
  onSend: (message: string) => void
  disabled: boolean
}

export function MessageComposer({ onSend, disabled }: MessageComposerProps) {
  const [value, setValue] = useState('')

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex items-end gap-2 border-t border-grey-100 p-3"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        maxLength={2000}
        rows={2}
        placeholder="Ask a question about this contract…"
        className="flex-1 resize-none rounded border border-grey-100 bg-white px-3 py-2 text-body-lg text-grey-900 placeholder:text-grey-300 focus:outline-none focus-visible:border-blue-500 disabled:bg-grey-25 disabled:text-grey-400"
      />
      <Button type="submit" size="sm" disabled={disabled || !value.trim()}>
        Send
      </Button>
    </form>
  )
}

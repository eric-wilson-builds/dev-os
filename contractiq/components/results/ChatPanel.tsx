'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageList, type ChatMessageItem } from './MessageList'
import { MessageComposer } from './MessageComposer'

interface ChatHistoryResponse {
  sessionId: string | null
  messages: ChatMessageItem[]
}

export function ChatPanel({ contractId }: { contractId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chatQuery = useQuery<ChatHistoryResponse>({
    queryKey: ['contract', contractId, 'chat'],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/${contractId}/chat`)
      if (!res.ok) throw new Error('query_failed')
      return res.json()
    },
    enabled: open,
  })

  async function handleSend(message: string) {
    setError(null)
    setPendingUserMessage(message)
    setIsStreaming(true)
    setStreamingText('')

    try {
      const res = await fetch(`/api/contracts/${contractId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? 'Something went wrong — please try again.')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setStreamingText(accumulated)
      }

      await queryClient.invalidateQueries({ queryKey: ['contract', contractId, 'chat'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setIsStreaming(false)
      setStreamingText(null)
      setPendingUserMessage(null)
    }
  }

  const persistedMessages = chatQuery.data?.messages ?? []
  const displayMessages: ChatMessageItem[] = pendingUserMessage
    ? [
        ...persistedMessages,
        { id: 'pending-user', role: 'user', content: pendingUserMessage, page_citation: null },
      ]
    : persistedMessages

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600"
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 flex h-[520px] w-96 flex-col overflow-hidden rounded-xl border border-grey-100 bg-white shadow-lg">
          <div className="border-b border-grey-100 px-4 py-3">
            <h2 className="text-body-lg font-medium text-grey-900">Ask about this contract</h2>
          </div>

          {chatQuery.isLoading ? (
            <div className="flex-1 p-4 text-body-sm text-grey-500">Loading…</div>
          ) : (
            <MessageList messages={displayMessages} streamingText={streamingText} />
          )}

          {error && (
            <p role="alert" className="px-4 py-2 text-body-sm text-red-700">
              {error}
            </p>
          )}

          <MessageComposer onSend={handleSend} disabled={isStreaming} />
        </div>
      )}
    </>
  )
}

import type { ReactNode } from 'react'
import { PageCitationLink } from './PageCitationLink'
import { ConversationSourceTag } from './ConversationSourceTag'

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  page_citation: number | null
}

const ATTRIBUTION_PATTERN = /(\[Page \d+\]|\[From conversation\])/

function renderContent(content: string): ReactNode[] {
  const parts = content.split(ATTRIBUTION_PATTERN)
  return parts.map((part, i) => {
    const pageMatch = part.match(/^\[Page (\d+)\]$/)
    if (pageMatch) return <PageCitationLink key={i} page={Number(pageMatch[1])} />
    if (part === '[From conversation]') return <ConversationSourceTag key={i} />
    return part ? <span key={i}>{part}</span> : null
  })
}

interface MessageListProps {
  messages: ChatMessageItem[]
  streamingText: string | null
}

export function MessageList({ messages, streamingText }: MessageListProps) {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {messages.length === 0 && streamingText === null && (
        <p className="text-body-sm text-grey-500">Ask a question about this contract to get started.</p>
      )}

      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-body-lg text-grey-900 ${
              m.role === 'user' ? 'bg-blue-50' : 'bg-grey-25'
            }`}
          >
            {renderContent(m.content)}
          </div>
        </div>
      ))}

      {streamingText !== null && (
        <div className="flex justify-start">
          <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-grey-25 px-3 py-2 text-body-lg text-grey-900">
            {renderContent(streamingText)}
          </div>
        </div>
      )}
    </div>
  )
}

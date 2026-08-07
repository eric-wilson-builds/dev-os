'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { SourceSentenceTooltip } from './SourceSentenceTooltip'
import { useUiStore } from '@/store/ui-store'
import type { Database } from '@/types/database'

type KeyTerm = Database['public']['Tables']['key_terms']['Row']

interface KeyTermRowProps {
  contractId: string
  term: KeyTerm
}

function confidenceBadge(score: number): { color: 'green' | 'yellow' | 'red'; label: string } {
  if (score >= 80) return { color: 'green', label: `${score}%` }
  if (score >= 50) return { color: 'yellow', label: `${score}%` }
  return { color: 'red', label: `${score}%` }
}

export function KeyTermRow({ contractId, term }: KeyTermRowProps) {
  const queryClient = useQueryClient()
  const setTargetPage = useUiStore((s) => s.setTargetPage)
  const setActivePanel = useUiStore((s) => s.setActivePanel)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(term.value)

  const editMutation = useMutation({
    mutationFn: async (newValue: string) => {
      const res = await fetch(`/api/contracts/${contractId}/terms/${term.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue }),
      })
      if (!res.ok) throw new Error('Something went wrong — please try again.')
      return res.json() as Promise<KeyTerm>
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<{ terms: KeyTerm[] } | undefined>(
        ['contract', contractId, 'terms'],
        (old) => (old ? { terms: old.terms.map((t) => (t.id === updated.id ? updated : t)) } : old)
      )
      setEditing(false)
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['contract', contractId, 'terms'] })
    },
  })

  const badge = confidenceBadge(term.confidence_score)
  const isLowConfidence = term.confidence_score < 50

  return (
    <div
      className={`flex flex-col gap-2 border-b border-grey-50 px-6 py-4 last:border-b-0 ${
        isLowConfidence ? 'bg-yellow-50' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-body-lg text-grey-900">{term.term_name}</span>
          {term.is_custom && <Badge color="violet">Custom</Badge>}
          {term.edited && <span className="text-body-sm text-grey-500">(edited)</span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setTargetPage(term.page_number)
              setActivePanel('viewer')
            }}
            className="text-body-sm text-blue-700 hover:underline"
          >
            Page {term.page_number}
          </button>
          <Badge color={badge.color} icon={isLowConfidence ? '⚠️' : undefined}>
            {badge.label}
          </Badge>
        </div>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
          <Button size="sm" onClick={() => editMutation.mutate(value)} disabled={editMutation.isPending}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false)
              setValue(term.value)
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-fit text-left text-body-lg text-grey-900 hover:underline"
        >
          {term.value}
        </button>
      )}

      <SourceSentenceTooltip sourceSentence={term.source_sentence} />

      {isLowConfidence && (
        <p role="status" className="text-body-sm text-red-700">
          ⚠️ Low confidence — we recommend verifying this in the document directly.
        </p>
      )}
    </div>
  )
}

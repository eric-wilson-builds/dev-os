'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/Badge'
import { STANDARD_TERMS } from '@/lib/openai/term-schemas'
import type { ContractType } from '@/types/database'

export interface CustomTermPreview {
  id: string
  term_name: string
}

interface TermPreviewListProps {
  contractId: string
  contractType: ContractType
  customTerms: CustomTermPreview[]
}

export function TermPreviewList({ contractId, contractType, customTerms }: TermPreviewListProps) {
  const queryClient = useQueryClient()

  const removeMutation = useMutation({
    mutationFn: async (termId: string) => {
      const res = await fetch(`/api/contracts/${contractId}/custom-terms/${termId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('delete_failed')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract', contractId, 'custom-terms'] })
    },
  })

  const standardTerms = STANDARD_TERMS[contractType]

  return (
    <ul className="flex flex-col gap-2">
      {standardTerms.map((name) => (
        <li
          key={name}
          className="flex items-center justify-between rounded border border-grey-100 bg-white px-4 py-3"
        >
          <span className="text-body-lg text-grey-900">{name}</span>
        </li>
      ))}
      {customTerms.map((term) => (
        <li
          key={term.id}
          className="flex items-center justify-between rounded border border-grey-100 bg-white px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-body-lg text-grey-900">{term.term_name}</span>
            <Badge color="violet">Custom</Badge>
          </div>
          <button
            type="button"
            onClick={() => removeMutation.mutate(term.id)}
            disabled={removeMutation.isPending}
            className="text-body-sm text-grey-500 hover:text-red-600"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  )
}

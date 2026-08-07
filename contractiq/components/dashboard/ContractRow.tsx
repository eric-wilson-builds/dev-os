'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDeleteModal } from '@/components/shared/ConfirmDeleteModal'
import { useToastStore } from '@/store/toast-store'
import type { ContractStatus, ContractType } from '@/types/database'

export interface DashboardContract {
  id: string
  contract_type: ContractType
  file_name: string
  status: ContractStatus
  created_at: string
}

const TYPE_LABEL: Record<ContractType, string> = { nda: 'NDA', msa: 'MSA' }

const STATUS_BADGE: Record<ContractStatus, { color: 'blue' | 'green' | 'red' | 'grey'; label: string }> = {
  pending: { color: 'grey', label: 'Pending' },
  processing: { color: 'blue', label: 'Processing' },
  completed: { color: 'green', label: 'Completed' },
  error: { color: 'red', label: 'Error' },
}

export function ContractRow({ contract }: { contract: DashboardContract }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.showToast)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contracts/${contract.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete_failed')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      showToast('Contract deleted.', 'success')
      setConfirmOpen(false)
    },
    onError: () => {
      showToast('We couldn’t delete this contract — please try again.', 'error')
    },
  })

  const status = STATUS_BADGE[contract.status]

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/contracts/${contract.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') router.push(`/contracts/${contract.id}`)
        }}
        className="flex cursor-pointer items-center justify-between gap-4 border-b border-grey-50 px-6 py-4 last:border-b-0 hover:bg-grey-25"
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="truncate text-body-lg text-grey-900">{contract.file_name}</span>
          <Badge color="grey">{TYPE_LABEL[contract.contract_type]}</Badge>
        </div>
        <span className="w-32 shrink-0 text-body-sm text-grey-500">
          {new Date(contract.created_at).toLocaleDateString()}
        </span>
        <div className="w-24 shrink-0">
          <Badge color={status.color}>{status.label}</Badge>
        </div>
        <button
          type="button"
          aria-label="Delete contract"
          onClick={(e) => {
            e.stopPropagation()
            setConfirmOpen(true)
          }}
          className="shrink-0 rounded p-2 text-grey-400 hover:bg-red-50 hover:text-red-600"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6h12z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <ConfirmDeleteModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        isDeleting={deleteMutation.isPending}
        message="This permanently deletes the contract, its key terms, and chat history. This can't be undone."
      />
    </>
  )
}

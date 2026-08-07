'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { ConfirmDeleteModal } from '@/components/shared/ConfirmDeleteModal'
import { useToastStore } from '@/store/toast-store'

export function DeleteContractButton({ contractId }: { contractId: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const showToast = useToastStore((s) => s.showToast)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contracts/${contractId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete_failed')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['contracts', 'summary'] })
      showToast('Contract deleted.', 'success')
      router.push('/dashboard')
    },
    onError: () => {
      showToast('We couldn’t delete this contract — please try again.', 'error')
    },
  })

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
        Delete Contract
      </Button>

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

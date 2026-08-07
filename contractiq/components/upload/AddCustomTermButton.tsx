'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const MAX_CUSTOM_TERMS = 5

interface AddCustomTermButtonProps {
  contractId: string
  currentCount: number
}

export function AddCustomTermButton({ contractId, currentCount }: AddCustomTermButtonProps) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')

  const addMutation = useMutation({
    mutationFn: async (termName: string) => {
      const res = await fetch(`/api/contracts/${contractId}/custom-terms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term_name: termName }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? 'Something went wrong — please try again.')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract', contractId, 'custom-terms'] })
      setValue('')
      setAdding(false)
    },
  })

  const remainingSlots = MAX_CUSTOM_TERMS - currentCount

  if (remainingSlots <= 0) {
    return <p className="text-body-sm text-grey-500">Maximum 5 custom terms per analysis.</p>
  }

  if (!adding) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
        + Add Key Term
      </Button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!value.trim()) return
        addMutation.mutate(value.trim())
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Non-compete radius"
          maxLength={100}
        />
        <Button type="submit" size="sm" disabled={addMutation.isPending}>
          Add
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setAdding(false)
            setValue('')
            addMutation.reset()
          }}
        >
          Cancel
        </Button>
      </div>

      {addMutation.isError && (
        <p role="alert" className="text-body-sm text-red-700">
          {addMutation.error instanceof Error ? addMutation.error.message : 'Something went wrong.'}
        </p>
      )}

      <p className="text-body-sm text-grey-500">{remainingSlots} of {MAX_CUSTOM_TERMS} remaining</p>
    </form>
  )
}

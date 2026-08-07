'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'

const MAX_COMMENT_LENGTH = 2000

type Rating = 'up' | 'down'

export function FeedbackWidget({ contractId }: { contractId: string }) {
  const [rating, setRating] = useState<Rating | null>(null)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contracts/${contractId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      })
      if (!res.ok) throw new Error('feedback_failed')
      return res.json()
    },
    onSuccess: () => setSubmitted(true),
  })

  if (submitted) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-grey-100 bg-white px-6 py-4">
        <p className="text-body-lg text-grey-900">Thanks for the feedback!</p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false)
            setRating(null)
            setComment('')
            submitMutation.reset()
          }}
          className="text-body-sm text-blue-700 hover:underline"
        >
          Submit different feedback
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-grey-100 bg-white px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="text-body-lg text-grey-900">Was this analysis helpful?</span>
        <button
          type="button"
          onClick={() => setRating('up')}
          aria-pressed={rating === 'up'}
          aria-label="Thumbs up"
          className={`flex h-9 w-9 items-center justify-center rounded border text-lg transition-colors duration-fast ${
            rating === 'up'
              ? 'border-green-500 bg-green-50 text-green-700'
              : 'border-grey-100 text-grey-500 hover:border-grey-200'
          }`}
        >
          👍
        </button>
        <button
          type="button"
          onClick={() => setRating('down')}
          aria-pressed={rating === 'down'}
          aria-label="Thumbs down"
          className={`flex h-9 w-9 items-center justify-center rounded border text-lg transition-colors duration-fast ${
            rating === 'down'
              ? 'border-red-500 bg-red-50 text-red-700'
              : 'border-grey-100 text-grey-500 hover:border-grey-200'
          }`}
        >
          👎
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
          maxLength={MAX_COMMENT_LENGTH}
          rows={3}
          placeholder="Optional comment…"
          className="resize-none rounded border border-grey-100 bg-white px-3 py-2 text-body-lg text-grey-900 placeholder:text-grey-300 focus:outline-none focus-visible:border-blue-500"
        />
        <span className="self-end text-body-sm text-grey-400">
          {comment.length}/{MAX_COMMENT_LENGTH}
        </span>
      </div>

      {submitMutation.isError && (
        <p role="alert" className="text-body-sm text-red-700">
          We couldn’t save your feedback — please try again.
        </p>
      )}

      <Button
        onClick={() => submitMutation.mutate()}
        disabled={!rating || submitMutation.isPending}
        className="w-fit"
      >
        Submit Feedback
      </Button>
    </div>
  )
}

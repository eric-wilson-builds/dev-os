'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { KeyTermRow } from './KeyTermRow'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Database } from '@/types/database'

type KeyTerm = Database['public']['Tables']['key_terms']['Row']

export function KeyTermsPanel({ contractId }: { contractId: string }) {
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const termsQuery = useQuery<{ terms: KeyTerm[] }>({
    queryKey: ['contract', contractId, 'terms'],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/${contractId}/terms`)
      if (!res.ok) throw new Error('query_failed')
      return res.json()
    },
  })

  const calibrationQuery = useQuery<{ calibrationStatus: 'ok' | 'degraded' }>({
    queryKey: ['calibration-status'],
    queryFn: async () => {
      const res = await fetch('/api/config/calibration-status')
      if (!res.ok) throw new Error('query_failed')
      return res.json()
    },
    staleTime: Infinity,
  })

  if (termsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (termsQuery.isError) {
    return (
      <p className="text-body-lg text-red-700">We couldn’t load the key terms — please try again.</p>
    )
  }

  const showCalibrationBanner =
    calibrationQuery.data?.calibrationStatus === 'degraded' && !bannerDismissed

  return (
    <div className="flex flex-col gap-4">
      {showCalibrationBanner && (
        <div className="flex items-center justify-between gap-4 rounded border border-yellow-200 bg-yellow-50 px-4 py-3 text-body-sm text-yellow-800">
          <span>
            Our confidence scores are running less accurate than usual this month — verify
            low-confidence terms carefully.
          </span>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 text-yellow-800 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-grey-100 bg-white">
        {termsQuery.data?.terms.map((term) => (
          <KeyTermRow key={term.id} contractId={contractId} term={term} />
        ))}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SummaryCard } from '@/components/dashboard/SummaryCard'
import { ContractList, type SortColumn, type SortOrder } from '@/components/dashboard/ContractList'
import { EmptyState } from '@/components/dashboard/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import type { DashboardContract } from '@/components/dashboard/ContractRow'

interface SummaryResponse {
  total: number
  byType: { nda: number; msa: number }
}

interface ContractsResponse {
  contracts: DashboardContract[]
}

export default function DashboardPage() {
  const [sort, setSort] = useState<SortColumn>('date')
  const [order, setOrder] = useState<SortOrder>('desc')

  const summaryQuery = useQuery<SummaryResponse>({
    queryKey: ['contracts', 'summary'],
    queryFn: async () => {
      const res = await fetch('/api/contracts/summary')
      if (!res.ok) throw new Error('query_failed')
      return res.json()
    },
  })

  const contractsQuery = useQuery<ContractsResponse>({
    queryKey: ['contracts', { sort, order }],
    queryFn: async () => {
      const res = await fetch(`/api/contracts?sort=${sort}&order=${order}`)
      if (!res.ok) throw new Error('query_failed')
      return res.json()
    },
  })

  function handleSortChange(column: SortColumn) {
    if (column === sort) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(column)
      setOrder('desc')
    }
  }

  const isEmpty = summaryQuery.data?.total === 0

  return (
    <main className="flex flex-col gap-10 px-28 py-24">
      <h1 className="text-h5 text-grey-900">Dashboard</h1>

      <SummaryCard
        total={summaryQuery.data?.total ?? 0}
        byType={summaryQuery.data?.byType ?? { nda: 0, msa: 0 }}
        isLoading={summaryQuery.isLoading}
      />

      {contractsQuery.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : contractsQuery.isError ? (
        <p className="text-body-lg text-red-700">
          We couldn’t load your contracts — please try again.
        </p>
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <ContractList
          contracts={contractsQuery.data?.contracts ?? []}
          sort={sort}
          order={order}
          onSortChange={handleSortChange}
        />
      )}
    </main>
  )
}

'use client'

import { ContractRow, type DashboardContract } from '@/components/dashboard/ContractRow'

export type SortColumn = 'date' | 'name' | 'type'
export type SortOrder = 'asc' | 'desc'

interface ContractListProps {
  contracts: DashboardContract[]
  sort: SortColumn
  order: SortOrder
  onSortChange: (sort: SortColumn) => void
}

function SortButton({
  column,
  label,
  sort,
  order,
  onSortChange,
  className = '',
}: {
  column: SortColumn
  label: string
  sort: SortColumn
  order: SortOrder
  onSortChange: (sort: SortColumn) => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onSortChange(column)}
      className={`flex items-center gap-1 text-body-sm font-medium text-grey-500 hover:text-grey-900 ${className}`}
    >
      {label}
      {sort === column && <SortIndicator order={order} />}
    </button>
  )
}

export function ContractList({ contracts, sort, order, onSortChange }: ContractListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-grey-100 bg-white">
      <div className="hidden items-center gap-4 border-b border-grey-100 bg-grey-25 px-6 py-3 sm:flex">
        <div className="flex flex-1 items-center gap-4">
          <SortButton column="name" label="Name" sort={sort} order={order} onSortChange={onSortChange} />
          <SortButton column="type" label="Type" sort={sort} order={order} onSortChange={onSortChange} />
        </div>
        <SortButton
          column="date"
          label="Date"
          sort={sort}
          order={order}
          onSortChange={onSortChange}
          className="w-32 shrink-0"
        />
        <span className="w-24 shrink-0 text-body-sm font-medium text-grey-500">Status</span>
        <span className="w-8 shrink-0" />
      </div>
      <div>
        {contracts.map((contract) => (
          <ContractRow key={contract.id} contract={contract} />
        ))}
      </div>
    </div>
  )
}

function SortIndicator({ order }: { order: SortOrder }) {
  return <span aria-hidden="true">{order === 'asc' ? '↑' : '↓'}</span>
}

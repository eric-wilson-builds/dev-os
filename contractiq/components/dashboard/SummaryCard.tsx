import { LinkButton } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'

interface SummaryCardProps {
  total: number
  byType: { nda: number; msa: number }
  isLoading?: boolean
}

export function SummaryCard({ total, byType, isLoading = false }: SummaryCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-grey-100 bg-white px-6 py-6">
      <div className="flex gap-12">
        <div className="flex flex-col gap-2">
          <span className="text-body-sm text-grey-500">Total reviewed</span>
          {isLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <span className="text-h5 text-grey-900">{total}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-body-sm text-grey-500">NDA</span>
          {isLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <span className="text-h5 text-grey-900">{byType.nda}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-body-sm text-grey-500">MSA</span>
          {isLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <span className="text-h5 text-grey-900">{byType.msa}</span>
          )}
        </div>
      </div>
      <LinkButton href="/upload">Review a Contract</LinkButton>
    </div>
  )
}

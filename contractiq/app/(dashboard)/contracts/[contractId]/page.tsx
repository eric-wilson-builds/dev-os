'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TermPreviewList } from '@/components/upload/TermPreviewList'
import { AddCustomTermButton } from '@/components/upload/AddCustomTermButton'
import { ProcessingIndicator } from '@/components/upload/ProcessingIndicator'
import { ContractViewerPanel } from '@/components/results/ContractViewerPanel'
import { KeyTermsPanel } from '@/components/results/KeyTermsPanel'
import { DisclaimerBanner } from '@/components/results/DisclaimerBanner'
import { DeleteContractButton } from '@/components/results/DeleteContractButton'
import { ChatPanel } from '@/components/results/ChatPanel'
import { FeedbackWidget } from '@/components/results/FeedbackWidget'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useUiStore } from '@/store/ui-store'
import type { Database } from '@/types/database'

type Contract = Database['public']['Tables']['contracts']['Row'] & { signedUrl: string | null }
type CustomTerm = Database['public']['Tables']['custom_key_terms']['Row']

export default function ContractPage({ params }: { params: { contractId: string } }) {
  const { contractId } = params
  const queryClient = useQueryClient()
  const processingStep = useUiStore((s) => s.processingStep)
  const setProcessingStep = useUiStore((s) => s.setProcessingStep)
  const activePanel = useUiStore((s) => s.activePanel)
  const setActivePanel = useUiStore((s) => s.setActivePanel)

  const contractQuery = useQuery<Contract>({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/${contractId}`)
      if (!res.ok) throw new Error('query_failed')
      return res.json()
    },
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 2000 : false),
  })

  const contract = contractQuery.data
  const isPending = contract?.status === 'pending'

  const customTermsQuery = useQuery<{ terms: CustomTerm[] }>({
    queryKey: ['contract', contractId, 'custom-terms'],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/${contractId}/custom-terms`)
      if (!res.ok) throw new Error('query_failed')
      return res.json()
    },
    enabled: isPending,
  })

  const processMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contracts/${contractId}/process`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? 'Something went wrong analyzing this contract.')
      }
      return res.json()
    },
    onMutate: () => {
      setProcessingStep('analyzing')
    },
    onSuccess: () => {
      setProcessingStep('compiling')
      queryClient.invalidateQueries({ queryKey: ['contract', contractId] })
      queryClient.invalidateQueries({ queryKey: ['contract', contractId, 'terms'] })
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['contract', contractId] })
    },
  })

  useEffect(() => {
    if (contract?.status === 'completed' || contract?.status === 'error') {
      setProcessingStep('idle')
    }
  }, [contract?.status, setProcessingStep])

  if (contractQuery.isLoading) {
    return (
      <main className="flex flex-col gap-6 px-28 py-24">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </main>
    )
  }

  if (contractQuery.isError || !contract) {
    return (
      <main className="px-28 py-24">
        <p className="text-body-lg text-red-700">We couldn’t load this contract — please try again.</p>
      </main>
    )
  }

  const showProcessing = processMutation.isPending || processingStep !== 'idle' || contract.status === 'processing'

  return (
    <main className="flex flex-col gap-10 px-28 py-24">
      <div>
        <h1 className="text-h5 text-grey-900">{contract.file_name}</h1>
        <p className="text-body-sm text-grey-500">{contract.contract_type.toUpperCase()}</p>
      </div>

      {showProcessing ? (
        <ProcessingIndicator />
      ) : contract.status === 'completed' ? (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <DisclaimerBanner />
            <DeleteContractButton contractId={contractId} />
          </div>

          <div className="flex gap-2 md:hidden">
            <Button
              size="sm"
              variant={activePanel === 'viewer' ? 'primary' : 'secondary'}
              onClick={() => setActivePanel('viewer')}
            >
              Document
            </Button>
            <Button
              size="sm"
              variant={activePanel === 'terms' ? 'primary' : 'secondary'}
              onClick={() => setActivePanel('terms')}
            >
              Key Terms
            </Button>
          </div>

          <div className="flex flex-col gap-6 md:flex-row">
            <div className={`flex-1 ${activePanel !== 'viewer' ? 'hidden md:block' : ''}`}>
              <ContractViewerPanel signedUrl={contract.signedUrl} contractText={contract.contract_text} />
            </div>
            <div className={`flex-1 ${activePanel !== 'terms' ? 'hidden md:block' : ''}`}>
              <KeyTermsPanel contractId={contractId} />
            </div>
          </div>

          <FeedbackWidget contractId={contractId} />

          <ChatPanel contractId={contractId} />
        </div>
      ) : contract.status === 'error' ? (
        <div className="flex flex-col gap-4">
          <p className="text-body-lg text-red-700">
            {processMutation.error instanceof Error
              ? processMutation.error.message
              : 'Something went wrong analyzing this contract.'}
          </p>
          <Button onClick={() => processMutation.mutate()} className="w-fit">
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <h2 className="text-h5 text-grey-900">Key terms to extract</h2>
            <TermPreviewList
              contractId={contractId}
              contractType={contract.contract_type}
              customTerms={customTermsQuery.data?.terms ?? []}
            />
            <AddCustomTermButton
              contractId={contractId}
              currentCount={customTermsQuery.data?.terms.length ?? 0}
            />
          </div>

          <Button
            onClick={() => processMutation.mutate()}
            disabled={processMutation.isPending}
            className="w-fit"
          >
            Process Contract
          </Button>
        </div>
      )}
    </main>
  )
}

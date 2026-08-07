'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ContractTypeSelector } from '@/components/upload/ContractTypeSelector'
import { Dropzone } from '@/components/upload/Dropzone'
import type { ContractType } from '@/types/database'

export default function UploadPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [contractType, setContractType] = useState<ContractType>('nda')

  return (
    <main className="flex flex-col gap-10 px-28 py-24">
      <h1 className="text-h5 text-grey-900">Review a Contract</h1>

      <div className="flex flex-col gap-6">
        <ContractTypeSelector value={contractType} onChange={setContractType} />

        <Dropzone
          contractType={contractType}
          onSuccess={(contract) => {
            queryClient.setQueryData(['contract', contract.id], contract)
            router.push(`/contracts/${contract.id}`)
          }}
        />
      </div>
    </main>
  )
}

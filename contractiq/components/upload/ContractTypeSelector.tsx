'use client'

import { useId } from 'react'
import type { ContractType } from '@/types/database'

interface ContractTypeSelectorProps {
  value: ContractType
  onChange: (value: ContractType) => void
  disabled?: boolean
}

export function ContractTypeSelector({ value, onChange, disabled = false }: ContractTypeSelectorProps) {
  const id = useId()

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-body-lg text-grey-900">
        Contract type
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ContractType)}
        className="w-48 rounded border border-grey-100 bg-white px-4 py-3 text-body-lg text-grey-900 transition-colors duration-fast hover:border-grey-200 focus:outline-none focus-visible:border-blue-500 disabled:bg-grey-25 disabled:text-grey-400"
      >
        <option value="nda">NDA</option>
        <option value="msa">MSA</option>
      </select>
    </div>
  )
}

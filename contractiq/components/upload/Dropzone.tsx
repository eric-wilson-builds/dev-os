'use client'

import { useRef, useState, type DragEvent } from 'react'
import type { ContractType } from '@/types/database'

const MAX_FILE_BYTES = 10 * 1024 * 1024

interface UploadedContract {
  id: string
  contract_type: ContractType
  file_name: string
  page_count: number
  status: string
}

interface DropzoneProps {
  contractType: ContractType
  onSuccess: (contract: UploadedContract) => void
}

function uploadWithProgress(
  file: File,
  contractType: ContractType,
  onProgress: (percent: number) => void
): Promise<UploadedContract> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    form.append('contract_type', contractType)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })

    xhr.addEventListener('load', () => {
      let body: unknown
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = null
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as UploadedContract)
      } else {
        const message =
          (body as { error?: { message?: string } } | null)?.error?.message ??
          'Something went wrong — please try again.'
        reject(new Error(message))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Something went wrong — please try again.')))

    xhr.open('POST', '/api/contracts')
    xhr.send(form)
  })
}

export function Dropzone({ contractType, onSuccess }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  function validate(file: File): string | null {
    if (!file.name.toLowerCase().endsWith('.pdf')) return 'Only PDF files are supported.'
    if (file.size > MAX_FILE_BYTES) return 'This file is larger than 10MB — please upload a smaller PDF.'
    return null
  }

  async function handleFile(file: File) {
    const validationError = validate(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setUploading(true)
    setProgress(0)

    try {
      const contract = await uploadWithProgress(file, contractType, setProgress)
      onSuccess(contract)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-16 text-center transition-colors duration-fast ${
          error
            ? 'border-red-500 bg-red-50'
            : dragActive
              ? 'border-grey-200 bg-grey-50'
              : 'border-grey-100 bg-white hover:border-grey-200'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />

        {uploading ? (
          <div className="flex w-full max-w-xs flex-col gap-2">
            <span className="text-body-lg text-grey-900">Uploading… {progress}%</span>
            <div className="h-2 w-full overflow-hidden rounded-sm bg-grey-50">
              <div
                className="h-full bg-blue-500 transition-all duration-fast"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <span className="text-body-lg text-grey-900">
              Drag and drop a PDF here, or click to browse
            </span>
            <span className="text-body-sm text-grey-500">PDF only, up to 10MB, 20 pages max</span>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-body-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { useUiStore } from '@/store/ui-store'
import { Button } from '@/components/ui/Button'

/**
 * Served as a static asset (public/pdf.worker.min.mjs, copied by scripts/copy-pdf-worker.js on
 * install) rather than bundled via `new URL(..., import.meta.url)` — the worker's ESM syntax
 * crashes Terser when webpack tries to bundle/minify it as a regular script in production.
 */
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export function PdfViewer({ url }: { url: string }) {
  const targetPage = useUiStore((s) => s.targetPage)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1)
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})

  useEffect(() => {
    if (targetPage && pageRefs.current[targetPage]) {
      pageRefs.current[targetPage]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [targetPage])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.1).toFixed(1))))}
        >
          −
        </Button>
        <span className="text-body-sm text-grey-500">{Math.round(scale * 100)}%</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setScale((s) => Math.min(2, Number((s + 0.1).toFixed(1))))}
        >
          +
        </Button>
      </div>

      <div className="h-[calc(100vh-320px)] overflow-y-auto rounded-lg border border-grey-100 bg-grey-25 p-4">
        <Document
          file={url}
          onLoadSuccess={({ numPages: loaded }) => setNumPages(loaded)}
          loading={<p className="text-body-sm text-grey-500">Loading PDF…</p>}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => (
            <div
              key={pageNumber}
              ref={(el) => {
                pageRefs.current[pageNumber] = el
              }}
              className={`mb-4 ${targetPage === pageNumber ? 'ring-2 ring-blue-500' : ''}`}
            >
              <Page pageNumber={pageNumber} scale={scale} />
            </div>
          ))}
        </Document>
      </div>
    </div>
  )
}

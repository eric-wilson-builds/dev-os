import pdf from 'pdf-parse/lib/pdf-parse.js'

interface PdfPageData {
  getTextContent: () => Promise<{ items: { str: string }[] }>
}

interface ExtractResult {
  text: string
  pageCount: number
}

/**
 * Inserts a `[PAGE N]` marker before each page's text — the same convention
 * contract-chat-spec.md and results-display-spec.md parse later to resolve page citations.
 */
export async function extractPdfText(buffer: Buffer): Promise<ExtractResult> {
  const pages: string[] = []

  await pdf(buffer, {
    pagerender: async (pageData: PdfPageData) => {
      const content = await pageData.getTextContent()
      const text = content.items.map((item) => item.str).join(' ')
      pages.push(text)
      return text
    },
  })

  const text = pages.map((pageText, i) => `[PAGE ${i + 1}]\n${pageText}`).join('\n\n')

  return { text, pageCount: pages.length }
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

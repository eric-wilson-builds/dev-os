import { PdfViewer } from './PdfViewer'
import { TextViewerFallback } from './TextViewerFallback'

interface ContractViewerPanelProps {
  signedUrl: string | null
  contractText: string
}

export function ContractViewerPanel({ signedUrl, contractText }: ContractViewerPanelProps) {
  return signedUrl ? <PdfViewer url={signedUrl} /> : <TextViewerFallback text={contractText} />
}

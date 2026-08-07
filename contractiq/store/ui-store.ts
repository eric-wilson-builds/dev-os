import { create } from 'zustand'

export type ActivePanel = 'viewer' | 'terms' | 'chat'
export type ProcessingStep = 'idle' | 'extracting' | 'analyzing' | 'compiling'

interface UiState {
  targetPage: number | null
  setTargetPage: (page: number | null) => void
  activePanel: ActivePanel
  setActivePanel: (panel: ActivePanel) => void
  isModalOpen: boolean
  setModalOpen: (open: boolean) => void
  processingStep: ProcessingStep
  setProcessingStep: (step: ProcessingStep) => void
}

export const useUiStore = create<UiState>((set) => ({
  targetPage: null,
  setTargetPage: (page) => set({ targetPage: page }),
  activePanel: 'viewer',
  setActivePanel: (panel) => set({ activePanel: panel }),
  isModalOpen: false,
  setModalOpen: (open) => set({ isModalOpen: open }),
  processingStep: 'idle',
  setProcessingStep: (step) => set({ processingStep: step }),
}))

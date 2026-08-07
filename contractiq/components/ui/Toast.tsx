'use client'

import { useToastStore, type ToastVariant } from '@/store/toast-store'

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: 'bg-green-50 border-green-500 text-green-700',
  error: 'bg-red-50 border-red-500 text-red-700',
  info: 'bg-white border-grey-100 text-grey-900',
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts)
  const dismissToast = useToastStore((state) => state.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.variant === 'error' ? 'alert' : 'status'}
          aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-body-lg shadow-lg ${VARIANT_CLASSES[toast.variant]}`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
            className="text-body-sm text-grey-500 hover:text-grey-900"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    const generatedId = useId()
    const textareaId = id ?? generatedId
    const errorId = `${textareaId}-error`

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label htmlFor={textareaId} className="text-body-lg text-grey-900">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`rounded border bg-white px-4 py-3 text-body-lg text-grey-900 placeholder:text-grey-300 transition-colors duration-fast focus:outline-none focus-visible:border-blue-500 disabled:bg-grey-25 disabled:text-grey-400 disabled:border-grey-100 ${
            error
              ? 'border-red-500 bg-red-50'
              : 'border-grey-100 hover:border-grey-200'
          } ${className}`}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-body-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

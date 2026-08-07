import { forwardRef, useId, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const errorId = `${inputId}-error`

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label htmlFor={inputId} className="text-body-lg text-grey-900">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
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

Input.displayName = 'Input'

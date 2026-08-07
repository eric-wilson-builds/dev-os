import { forwardRef, type ButtonHTMLAttributes, type AnchorHTMLAttributes } from 'react'
import Link from 'next/link'

export type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type Size = 'default' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 disabled:bg-grey-50 disabled:text-grey-400',
  secondary:
    'bg-white text-grey-900 border border-grey-100 hover:bg-grey-50 hover:border-grey-200 active:bg-grey-100 disabled:bg-grey-25 disabled:text-grey-400 disabled:border-grey-100',
  ghost:
    'bg-transparent text-grey-900 hover:bg-grey-50 active:bg-grey-100 disabled:text-grey-400',
  destructive:
    'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 disabled:bg-grey-50 disabled:text-grey-400',
}

export const SIZE_CLASSES: Record<Size, string> = {
  default: 'px-4 py-3 text-body-lg',
  sm: 'px-3 py-2 text-body-sm',
}

export const BUTTON_BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors duration-fast disabled:cursor-not-allowed'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'default', className = '', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${BUTTON_BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  variant?: Variant
  size?: Size
}

/** A CTA that navigates rather than submits — same visual language as Button. */
export function LinkButton({
  href,
  variant = 'primary',
  size = 'default',
  className = '',
  ...props
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={`${BUTTON_BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  )
}

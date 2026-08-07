import type { ReactNode } from 'react'

type Color = 'green' | 'red' | 'yellow' | 'blue' | 'grey' | 'violet'

interface BadgeProps {
  color: Color
  icon?: ReactNode
  children: ReactNode
  className?: string
}

const COLOR_CLASSES: Record<Color, string> = {
  green: 'bg-green-50 border-green-200 text-green-700',
  red: 'bg-red-50 border-red-200 text-red-700',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  grey: 'bg-grey-50 border-grey-200 text-grey-700',
  violet: 'bg-violet-50 border-violet-200 text-violet-700',
}

/**
 * Semantic Status Badge (docs/design.md Reusable Patterns). `icon` is required-by-convention
 * for confidence/status badges so color is never the only signal — pass an icon or a leading
 * glyph alongside the text label.
 */
export function Badge({ color, icon, children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-body-sm font-medium ${COLOR_CLASSES[color]} ${className}`}
    >
      {icon}
      {children}
    </span>
  )
}

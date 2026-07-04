import { type ReactNode } from 'react'
import { cn } from '../../../core/utils'

interface BadgeProps {
  variant?: 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral'
  size?: 'sm' | 'md'
  children: ReactNode
  className?: string
}

export function Badge({ variant = 'primary', size = 'sm', children, className }: BadgeProps) {
  const variants = {
    primary: 'bg-primary-container text-on-primary-container',
    accent: 'bg-tertiary-container text-on-tertiary-container',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-error-container text-on-error-container',
    neutral: 'bg-surface-variant text-on-surface-variant',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  }

  return (
    <span className={cn('inline-flex items-center rounded-full font-medium', variants[variant], sizes[size], className)}>
      {children}
    </span>
  )
}

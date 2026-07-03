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
    primary: 'bg-primary-100 text-primary-dark',
    accent: 'bg-accent-100 text-accent-dark',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
    neutral: 'bg-gray-100 text-gray-700',
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

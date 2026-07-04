import type { ReactNode } from 'react'
import { cn } from '../../../core/utils'
import { Tooltip } from './Tooltip'

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  children?: ReactNode
  tooltip?: string
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void
  type?: 'button' | 'submit'
  className?: string
  form?: string
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  children,
  tooltip,
  onClick,
  type = 'button',
  className,
  form,
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-dark focus:ring-primary',
    secondary: 'bg-surface text-primary border border-primary hover:bg-primary-50 focus:ring-primary',
    ghost: 'text-primary hover:bg-primary-container/50 focus:ring-primary',
    danger: 'bg-error text-white hover:bg-error/90 focus:ring-error',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  }

  const isIconOnly = tooltip && !children
  const buttonEl = (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      form={form}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {loading && (
        <span className="animate-spin rounded-full h-4 w-4 border-2 border-on-primary border-t-transparent" />
      )}
      {!loading && iconPosition === 'left' && icon}
      {children}
      {!loading && iconPosition === 'right' && icon}
    </button>
  )

  if (isIconOnly) {
    return <Tooltip content={tooltip}>{buttonEl}</Tooltip>
  }

  return buttonEl
}

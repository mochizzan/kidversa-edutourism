import { type ReactNode } from 'react'
import { cn } from '../../../core/utils'

interface KpiCardProps {
  icon: ReactNode
  value: string | number
  label: string
  subtitle?: string
  accent: 'purple' | 'amber' | 'green'
  loading?: boolean
  className?: string
}

const accentBorder = {
  purple: 'border-l-4 border-l-primary',
  amber: 'border-l-4 border-l-accent',
  green: 'border-l-4 border-l-green-500',
}

const accentText = {
  purple: 'text-primary',
  amber: 'text-accent',
  green: 'text-green-600',
}

export function KpiCard({
  icon,
  value,
  label,
  subtitle,
  accent,
  loading = false,
  className,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className={cn('bg-surface rounded-2xl p-5 shadow-sm', className)}>
        <div className="animate-pulse flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container-high" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-surface-container-high rounded w-1/3" />
            <div className="h-7 bg-surface-container-high rounded w-2/3" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-surface rounded-2xl p-5 shadow-sm border-l-4',
        accentBorder[accent],
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center', accentText[accent])}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-on-surface-variant">{label}</p>
          <p className="text-2xl font-bold text-on-surface mt-0.5">{value}</p>
          {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

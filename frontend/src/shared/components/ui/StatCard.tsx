import { type ReactNode } from 'react'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn } from '../../../core/utils'

interface StatCardProps {
  label: string
  value: string | number
  icon: ReactNode
  change?: {
    value: string
    type: 'increase' | 'decrease' | 'neutral'
  }
  href?: string
  accent: string
  className?: string
}

export function StatCard({
  label,
  value,
  icon,
  change,
  href,
  accent,
  className,
}: StatCardProps) {
  const changeColors = {
    increase: 'text-green-600',
    decrease: 'text-red-600',
    neutral: 'text-gray-500',
  }

  const changeIcons = {
    increase: <ArrowUp className="w-3 h-3" />,
    decrease: <ArrowDown className="w-3 h-3" />,
    neutral: <Minus className="w-3 h-3" />,
  }

  const Wrapper = href ? 'a' : 'div'
  const wrapperProps = href ? { href } : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'bg-white rounded-xl border border-gray-200 p-6 transition-all hover:shadow-md',
        href && 'cursor-pointer hover:border-gray-300',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>

          {change && (
            <div
              className={cn(
                'flex items-center gap-1 mt-2 text-sm font-medium',
                changeColors[change.type]
              )}
            >
              {changeIcons[change.type]}
              <span>{change.value}</span>
            </div>
          )}
        </div>

        <div
          className={cn(
            'flex items-center justify-center w-12 h-12 rounded-xl',
            accent
          )}
        >
          {icon}
        </div>
      </div>
    </Wrapper>
  )
}

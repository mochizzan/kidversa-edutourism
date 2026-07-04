import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { cn } from '../../../core/utils'
import { Tooltip } from './Tooltip'

interface CategoryCardProps {
  icon: LucideIcon
  title: string
  subtitle: string
  iconBg: string
}

export function CategoryCard({ icon: Icon, title, subtitle, iconBg }: CategoryCardProps) {
  return (
    <div className="bg-surface rounded-2xl p-4 flex items-center gap-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group">
      <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover:scale-110 group-hover:shadow-sm', iconBg)}>
        <Icon className="w-6 h-6 transition-transform duration-200 group-hover:scale-110" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-on-surface-variant font-medium">{subtitle}</p>
        <p className="text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors duration-200">{title}</p>
      </div>
      <Tooltip content="Lainnya">
        <button className="text-on-surface-variant hover:text-on-surface transition-colors duration-200">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </Tooltip>
    </div>
  )
}

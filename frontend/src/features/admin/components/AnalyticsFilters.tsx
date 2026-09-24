import { Filter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../core/utils'
import { Select } from '../../../shared/components/ui/Select'

interface AnalyticsFiltersProps {
  dateRange: string
  onDateRangeChange: (value: string) => void
  programs: Array<{ id: string; name: string }>
  selectedProgram: string
  onProgramChange: (value: string) => void
  statusFilter: string[]
  onStatusFilterChange: (statuses: string[]) => void
}

const dateRangeOptions = [
  { value: '7', labelKey: 'admin.analytics.range7' },
  { value: '30', labelKey: 'admin.analytics.range30' },
  { value: '90', labelKey: 'admin.analytics.range90' },
  { value: 'all', labelKey: 'admin.common.all' },
] as const

const statusOptions = [
  { value: 'DRAFT', labelKey: 'admin.status.draft' },
  { value: 'ACTIVE', labelKey: 'admin.status.active' },
  { value: 'COMPLETED', labelKey: 'admin.status.completed' },
  { value: 'CANCELLED', labelKey: 'admin.status.cancelled' },
] as const

export function AnalyticsFilters({
  dateRange,
  onDateRangeChange,
  programs,
  selectedProgram,
  onProgramChange,
  statusFilter,
  onStatusFilterChange,
}: AnalyticsFiltersProps) {
  const { t } = useTranslation()
  const toggleStatus = (status: string) => {
    if (statusFilter.includes(status)) {
      onStatusFilterChange(statusFilter.filter((s) => s !== status))
    } else {
      onStatusFilterChange([...statusFilter, status])
    }
  }

  return (
    <div className="bg-surface rounded-3xl p-4 shadow-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">{t('admin.analytics.filterLabel')}</span>
        </div>

        <div className="flex gap-1 bg-surface-container-low rounded-xl p-1">
          {dateRangeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onDateRangeChange(opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                dateRange === opt.value
                  ? 'bg-primary text-white'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>

        <Select
          label={t('admin.col.program')}
          value={selectedProgram}
          onChange={(e) => onProgramChange(e.target.value)}
          options={[
            { value: '', label: t('admin.common.allPrograms') },
            ...programs.map((p) => ({ value: p.id, label: p.name })),
          ]}
          className="w-48"
        />

        <div className="flex flex-wrap gap-1.5">
          {statusOptions.map((opt) => {
            const active = statusFilter.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggleStatus(opt.value)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                  active
                    ? 'border-primary bg-primary-container text-on-primary-container'
                    : 'border-outline-variant text-on-surface-variant hover:text-on-surface',
                )}
              >
                {t(opt.labelKey)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

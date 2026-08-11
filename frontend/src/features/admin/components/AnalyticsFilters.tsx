import { Filter } from 'lucide-react'
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
  { value: '7', label: '7 Hari' },
  { value: '30', label: '30 Hari' },
  { value: '90', label: '90 Hari' },
  { value: 'all', label: 'Semua' },
]

const statusOptions = [
  { value: 'DRAFT', label: 'Draf' },
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'COMPLETED', label: 'Selesai' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
]

export function AnalyticsFilters({
  dateRange,
  onDateRangeChange,
  programs,
  selectedProgram,
  onProgramChange,
  statusFilter,
  onStatusFilterChange,
}: AnalyticsFiltersProps) {
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
          <span className="text-sm font-medium">Filter</span>
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
              {opt.label}
            </button>
          ))}
        </div>

        <Select
          label="Program"
          value={selectedProgram}
          onChange={(e) => onProgramChange(e.target.value)}
          options={[
            { value: '', label: 'Semua Program' },
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
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

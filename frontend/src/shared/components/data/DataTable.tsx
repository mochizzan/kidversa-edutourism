import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../../core/utils'

export interface Column<T> {
  key: string
  header: string
  render?: (item: T) => React.ReactNode
  sortable?: boolean
  width?: string
  align?: 'left' | 'center' | 'right'
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  loading?: boolean
  page?: number
  pageSize?: number
  total?: number
  onPageChange?: (page: number) => void
  onSearch?: (query: string) => void
  selectable?: boolean
  selectedRows?: string[]
  onSelectionChange?: (ids: string[]) => void
  getRowId: (item: T) => string
  rowClassName?: (item: T) => string
  emptyState?: React.ReactNode
  actions?: React.ReactNode
  ariaLabel?: string
}

export function DataTable<T>({
  data,
  columns,
  loading = false,
  page = 1,
  pageSize = 10,
  total = 0,
  onPageChange,
  onSearch,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  getRowId,
  rowClassName,
  emptyState,
  actions,
  ariaLabel,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const sortedData = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey]
      const bVal = (b as Record<string, unknown>)[sortKey]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      const cmp = String(aVal).localeCompare(String(bVal), 'id-ID')
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortOrder])

  const totalPages = Math.ceil(total / pageSize) || 1

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    onSearch?.(query)
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  const allSelected = sortedData.length > 0 && selectedRows.length === sortedData.length
  const someSelected = selectedRows.length > 0 && !allSelected

  const toggleSelectAll = () => {
    if (allSelected) {
      onSelectionChange?.([])
    } else {
      onSelectionChange?.(sortedData.map(getRowId))
    }
  }

  const toggleSelectRow = (id: string) => {
    if (selectedRows.includes(id)) {
      onSelectionChange?.(selectedRows.filter((rowId) => rowId !== id))
    } else {
      onSelectionChange?.([...selectedRows, id])
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        {onSearch && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Cari..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-surface-container-low rounded-2xl border-0 focus:ring-2 focus:ring-primary-container focus:outline-none"
            />
          </div>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      <div className="bg-surface rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" aria-label={ariaLabel}>
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                {selectable && (
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Select all rows"
                      className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                    />
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      'px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wider',
                      column.align === 'center' && 'text-center',
                      column.align === 'right' && 'text-right',
                      column.width && `w-[${column.width}]`
                    )}
                  >
                    {column.sortable ? (
                      <button
                        onClick={() => handleSort(column.key)}
                        className="flex items-center gap-1 hover:text-on-surface transition-colors"
                      >
                        {column.header}
                        {sortKey === column.key ? (
                          sortOrder === 'asc' ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )
                        ) : (
                          <div className="w-4 h-4" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {loading ? (
                Array.from({ length: pageSize }).map((_, index) => (
                  <tr key={index}>
                    {selectable && (
                      <td className="px-4 py-3">
                        <div className="h-4 w-4 bg-surface-container-high rounded" />
                      </td>
                    )}
                    {columns.map((_, colIndex) => (
                      <td key={colIndex} className="px-4 py-3">
                        <div className="h-4 bg-surface-container-high rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)}>
                    {emptyState || (
                      <div className="py-12 text-center text-on-surface-variant">Tidak ada data</div>
                    )}
                  </td>
                </tr>
              ) : (
                sortedData.map((item) => {
                  const rowId = getRowId(item)
                  const isSelected = selectedRows.includes(rowId)
                  return (
                    <tr
                      key={rowId}
                      className={cn(
                        'hover:bg-surface-container-low/50 transition-colors',
                        isSelected && 'bg-primary-container/30',
                        rowClassName?.(item)
                      )}
                    >
                      {selectable && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(rowId)}
                            aria-label={`Select row ${rowId}`}
                            className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            'px-4 py-3 text-sm text-on-surface',
                            column.align === 'center' && 'text-center',
                            column.align === 'right' && 'text-right'
                          )}
                        >
                          {column.render ? column.render(item) : (item as Record<string, unknown>)[column.key] as string}
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant">
            <div className="text-sm text-on-surface-variant">
              Menampilkan {(page - 1) * pageSize + 1} sampai {Math.min(page * pageSize, total)} dari {total} data
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange?.(page - 1)}
                disabled={page === 1}
                aria-label="Halaman sebelumnya"
                className="p-2 rounded-xl border border-outline-variant hover:bg-surface-container-low disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-on-surface-variant">
                Halaman {page} dari {totalPages}
              </span>
              <button
                onClick={() => onPageChange?.(page + 1)}
                disabled={page === totalPages}
                aria-label="Halaman berikutnya"
                className="p-2 rounded-xl border border-outline-variant hover:bg-surface-container-low disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

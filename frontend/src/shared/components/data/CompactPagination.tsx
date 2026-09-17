import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../ui/Button'

export interface CompactPaginationProps {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  itemLabel?: string
  className?: string
}

export function CompactPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'data',
  className = '',
}: CompactPaginationProps) {
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  return (
    <div className={`flex items-center justify-between mt-4 px-1 ${className}`}>
      <span className="text-sm text-on-surface-variant">
        Menampilkan {start}-{end} dari {totalItems} {itemLabel}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronLeft />}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Halaman sebelumnya"
        />
        <span className="text-sm text-on-surface-variant min-w-[3rem] text-center">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronRight />}
          iconPosition="right"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Halaman berikutnya"
        />
      </div>
    </div>
  )
}

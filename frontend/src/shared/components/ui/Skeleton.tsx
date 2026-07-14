// Skeleton — reusable loading placeholders.
import { cn } from '../../../core/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={cn('bg-surface-container-high rounded animate-pulse', className)} />
}

export function SkeletonCard({ className = '' }: SkeletonProps) {
  return (
    <div className={cn('space-y-4 p-4', className)}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

export function SkeletonList({ rows = 3, className = '' }: { rows?: number } & SkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

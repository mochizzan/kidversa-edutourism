// Spinner — reusable loading spinner.
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_MAP: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      className={`${SIZE_MAP[size]} rounded-full border-2 border-primary border-t-transparent animate-spin ${className}`}
      role="status"
      aria-label="Memuat"
    />
  )
}

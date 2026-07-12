import { cn } from '../../../core/utils'
import { useConnectionStatus } from '../../hooks/useConnectionStatus'

interface ConnectionStatusProps {
  className?: string
}

type ConnStatus = 'online' | 'degraded' | 'reconnecting'

const statusConfig: Record<
  ConnStatus,
  { label: string; dot: string; bg: string }
> = {
  online: {
    label: 'Online',
    dot: 'bg-green-500',
    bg: 'bg-green-50 text-green-700 border-green-200',
  },
  degraded: {
    label: 'Koneksi Terbatas',
    dot: 'bg-blue-500 animate-pulse',
    bg: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  reconnecting: {
    label: 'Menghubungkan…',
    dot: 'bg-gray-400',
    bg: 'bg-gray-50 text-gray-500 border-gray-200',
  },
}

export default function ConnectionStatus({ className }: ConnectionStatusProps) {
  const { status } = useConnectionStatus()

  const config = statusConfig[status]

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border',
        config.bg,
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      <span>{config.label}</span>
    </div>
  )
}

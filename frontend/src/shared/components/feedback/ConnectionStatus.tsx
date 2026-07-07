import { cn } from '../../../core/utils'
import { useConnectionStatus } from '../../hooks/useConnectionStatus'
import { ConnectionStatus as ConnectionStatusEnum } from '../../../core/types/enums'

interface ConnectionStatusProps {
  className?: string
}

const statusConfig: Record<
  ConnectionStatusEnum,
  { label: string; dot: string; bg: string }
> = {
  [ConnectionStatusEnum.CLOUD]: {
    label: 'Online Cloud',
    dot: 'bg-green-500',
    bg: 'bg-green-50 text-green-700 border-green-200',
  },
  [ConnectionStatusEnum.EDGE]: {
    label: 'Menyinkronkan',
    dot: 'bg-blue-500 animate-pulse',
    bg: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  [ConnectionStatusEnum.OFFLINE]: {
    label: 'Offline Lokal',
    dot: 'bg-gray-400',
    bg: 'bg-gray-50 text-gray-500 border-gray-200',
  },
}

export default function ConnectionStatus({ className }: ConnectionStatusProps) {
  const { status, pendingSyncCount } = useConnectionStatus()

  const config = statusConfig[status]

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border',
        config.bg,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      <span>{config.label}</span>
      {pendingSyncCount > 0 && status !== ConnectionStatusEnum.OFFLINE && (
        <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px]">
          {pendingSyncCount} pending
        </span>
      )}
    </div>
  )
}

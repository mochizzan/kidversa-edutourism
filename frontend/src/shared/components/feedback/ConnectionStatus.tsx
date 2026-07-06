import { cn } from '../../../core/utils'
import { useConnectionStatus } from '../../hooks/useConnectionStatus'
import { ConnectionStatus as ConnectionStatusEnum } from '../../../core/types/enums'

interface ConnectionStatusProps {
  isSyncing?: boolean
  className?: string
}

const statusConfig: Record<
  ConnectionStatusEnum,
  { label: string; dot: string; bg: string }
> = {
  [ConnectionStatusEnum.CLOUD]: {
    label: '☁️ Cloud',
    dot: 'bg-green-500',
    bg: 'bg-green-50 text-green-700 border-green-200',
  },
  [ConnectionStatusEnum.EDGE]: {
    label: '🔗 Edge',
    dot: 'bg-blue-500',
    bg: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  [ConnectionStatusEnum.OFFLINE]: {
    label: '⚪ Offline',
    dot: 'bg-gray-400',
    bg: 'bg-gray-50 text-gray-500 border-gray-200',
  },
}

const syncingConfig = {
  label: '⟳ Sync',
  dot: 'bg-yellow-500',
  bg: 'bg-yellow-50 text-yellow-700 border-yellow-200',
} as const

export default function ConnectionStatus({
  isSyncing = false,
  className,
}: ConnectionStatusProps) {
  const { status } = useConnectionStatus()

  if (isSyncing) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border',
          syncingConfig.bg,
          className
        )}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full', syncingConfig.dot)} />
        <span>{syncingConfig.label}</span>
      </div>
    )
  }

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
    </div>
  )
}

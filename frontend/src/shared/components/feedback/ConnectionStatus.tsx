import { useTranslation } from 'react-i18next'
import { cn } from '../../../core/utils'
import { useConnectionStatus } from '../../hooks/useConnectionStatus'

interface ConnectionStatusProps {
  className?: string
}

const CONNECTED: 'online' | 'degraded' | 'reconnecting' = 'online'

const config = {
  connected: {
    labelKey: 'common.connection.labelOnline',
    icon: 'text-green-600',
    ring: 'text-green-600',
    glow: 'bg-green-500',
    dot: 'bg-green-500',
  },
  disconnected: {
    labelKey: 'common.connection.labelOffline',
    icon: 'text-red-600',
    ring: 'text-red-600',
    glow: 'bg-red-500',
    dot: 'bg-red-500 animate-pulse',
  },
} as const

export default function ConnectionStatus({ className }: ConnectionStatusProps) {
  const { t } = useTranslation()
  const { status } = useConnectionStatus()
  const isConnected = status === CONNECTED
  const state = isConnected ? config.connected : config.disconnected

  return (
    <div className={cn('relative', className)}>
      <span className={cn('absolute inset-0 rounded-full opacity-15', state.glow)} aria-hidden />
      <svg
        className={cn('relative w-5 h-5', state.icon)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label={t(state.labelKey)}
      >
        <path d="M2.5 8.5a15 15 0 0 1 19 0" />
        <path d="M5.5 12a10 10 0 0 1 13 0" />
        <path d="M8.5 15.5a5 5 0 0 1 7 0" />
        <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
      </svg>
      <span className={cn('absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-surface', state.dot)} aria-hidden />
    </div>
  )
}

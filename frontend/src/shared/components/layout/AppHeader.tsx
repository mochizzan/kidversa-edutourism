import { Search, Video, Bell, Menu } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { Tooltip } from '../ui/Tooltip'

interface AppHeaderProps {
  onMenuToggle?: () => void
}

export function AppHeader({ onMenuToggle }: AppHeaderProps) {
  const { user } = useAuth()

  return (
    <header className="h-16 lg:h-20 flex-shrink-0 flex items-center gap-3 px-4 lg:px-8 bg-surface border-b border-outline-variant">
      {onMenuToggle && (
        <Tooltip content="Menu">
          <button
            onClick={onMenuToggle}
            className="lg:hidden shrink-0 w-9 h-9 rounded-full bg-surface shadow-sm flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </Tooltip>
      )}
      <div className="relative w-full max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
        <input
          type="text"
          placeholder="Cari program, sesi, peserta..."
          className="w-full bg-surface-container-low border-0 rounded-2xl py-2.5 lg:py-3 pl-12 pr-4 text-sm text-on-surface placeholder-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
        />
      </div>
      <div className="flex items-center gap-4 ml-auto shrink-0">
        <Tooltip content="Video">
          <button className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-surface shadow-sm flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
            <Video className="w-5 h-5" />
          </button>
        </Tooltip>
        <Tooltip content="Notifikasi">
          <button className="relative w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-surface shadow-sm flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full" />
          </button>
        </Tooltip>
        {user && (
          <div className="flex items-center gap-3 ml-2">
            <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-full border border-outline-variant overflow-hidden flex items-center justify-center bg-primary-container text-on-primary-container font-bold text-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-on-surface hidden md:block">{user.name}</span>
          </div>
        )}
      </div>
    </header>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Video, Bell, Menu, X, Users, FolderOpen, Calendar, Image, Loader2, ChevronRight, Wifi, UserCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../core/hooks/useAuth'
import { Tooltip } from '../ui/Tooltip'
import { useGlobalSearch } from '../../hooks/useGlobalSearch'
import { useHeaderNotifications } from '../../hooks/useHeaderNotifications'
import { useTenantStore } from '../../../core/stores/tenantStore'
import { isSuperAdmin } from '../../../core/utils/permissions'
import { getAll } from '../../../core/services/storage/idb'
import type { Tenant } from '../../../core/types'

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Users: <Users className="w-4 h-4" />,
  Programs: <FolderOpen className="w-4 h-4" />,
  Sessions: <Calendar className="w-4 h-4" />,
  Frames: <Image className="w-4 h-4" />,
}

interface AppHeaderProps {
  onMenuToggle?: () => void
}

export function AppHeader({ onMenuToggle }: AppHeaderProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const notificationRef = useRef<HTMLDivElement>(null)
  const { query, setQuery, loading, results, searched, reset } = useGlobalSearch()
  const { notifications, unreadCount } = useHeaderNotifications()
  const { setActiveTenant, tenants: storeTenants } = useTenantStore()
  const [focused, setFocused] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const close = useCallback(() => {
    setFocused(false)
    reset()
  }, [reset])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (!focused) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [focused, close])

  useEffect(() => {
    if (!focused) return
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        close()
      }
    }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [focused, close])

  useEffect(() => {
    if (!showNotifications) return
    const handleClick = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showNotifications])

  const handleNavigate = (route: string) => {
    close()
    navigate(route)
  }

  const handleFocus = () => setFocused(true)

  const flatResults = results.flatMap((group) => [
    { type: 'category' as const, category: group.category, route: group.route, icon: CATEGORY_ICONS[group.category] },
    ...group.items.map((item) => ({ type: 'item' as const, category: group.category, id: item.id, label: item.label, subtitle: item.subtitle, route: item.route })),
  ])

  const handleNotificationClick = async (notif: { route?: string; tenant_id?: string | null }) => {
    setShowNotifications(false)
    if (!notif.route) return

    if (notif.tenant_id && isSuperAdmin(user)) {
      let tenant = storeTenants.find((t) => t.id === notif.tenant_id)
      if (!tenant) {
        const allTenants = await getAll<Tenant>('tenants')
        tenant = allTenants.find((t) => t.id === notif.tenant_id)
      }
      if (tenant) {
        setActiveTenant(tenant)
      }
    }

    navigate(notif.route)
  }

  const NOTIF_ICONS: Record<string, React.ReactNode> = {
    connection: <Wifi className="w-5 h-5" />,
    user_approval: <UserCheck className="w-5 h-5" />,
    sync: <Loader2 className="w-5 h-5" />,
  }

  return (
    <>
      <header className="h-16 lg:h-20 flex-shrink-0 flex items-center gap-3 px-4 lg:px-8 bg-surface border-b border-outline-variant relative z-50">
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

        <div ref={wrapperRef} className="relative w-full max-w-xl">
          <div
            className={`flex items-center gap-3 transition-all duration-200 text-left px-4 ${
              focused
                ? 'bg-surface rounded-t-2xl ring-2 ring-primary shadow-lg py-3.5 lg:py-4'
                : 'bg-surface-container-low rounded-2xl shadow-sm py-2.5 lg:py-3'
            }`}
          >
            <Search className={`w-5 h-5 shrink-0 transition-colors duration-200 ${focused ? 'text-primary' : 'text-on-surface-variant'}`} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={handleFocus}
              placeholder="Cari program, sesi, peserta..."
              className="flex-1 bg-transparent border-0 outline-none text-sm text-on-surface placeholder-on-surface-variant min-w-0"
            />
            {loading && <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />}
            {query && !loading && (
              <button onClick={() => setQuery('')} className="shrink-0 p-1 rounded-lg hover:bg-surface-container transition-colors" aria-label="Hapus">
                <X className="w-4 h-4 text-on-surface-variant" />
              </button>
            )}
            <kbd className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono border shrink-0 transition-all duration-200 ${focused ? 'bg-primary-container text-primary border-primary/30' : 'bg-surface text-on-surface-variant border-outline-variant/50'}`}>
              <span className="text-[9px]">⌘</span>K
            </kbd>
          </div>

          {focused && (
            <div className="absolute top-full left-0 right-0 bg-surface rounded-b-2xl shadow-lg overflow-hidden animate-fade-in-up-sm">
              {!searched && !loading && (
                <div className="py-8 text-center">
                  <Search className="w-7 h-7 mx-auto mb-2 text-outline" />
                  <p className="text-sm text-on-surface-variant">Ketik untuk mulai mencari...</p>
                </div>
              )}

              {loading && flatResults.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-8 text-on-surface-variant">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Mencari...</span>
                </div>
              )}

              {!loading && searched && flatResults.length === 0 && (
                <div className="py-8 text-center">
                  <Search className="w-7 h-7 mx-auto mb-2 text-outline" />
                  <p className="text-sm text-on-surface-variant px-4">Tidak ditemukan hasil untuk "{query}"</p>
                </div>
              )}

              {flatResults.length > 0 && (
                <div className="max-h-[50vh] overflow-y-auto p-2">
                  {flatResults.map((result, idx) => {
                    if (result.type === 'category') {
                      return (
                        <button
                          key={`cat-${result.category}`}
                          onClick={() => handleNavigate(result.route)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 mt-2 first:mt-0 text-sm font-semibold text-on-surface hover:bg-primary-container/50 rounded-lg transition-colors group"
                        >
                          <span className="text-primary shrink-0">{result.icon}</span>
                          <span>{result.category}</span>
                          <ChevronRight className="w-3.5 h-3.5 ml-auto text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      )
                    }
                    const nextIdx = idx + 1
                    const isLast = nextIdx >= flatResults.length || flatResults[nextIdx].type === 'category'
                    return (
                      <button
                        key={`item-${result.category}-${result.id}`}
                        onClick={() => handleNavigate(result.route)}
                        className="w-full flex items-stretch gap-0 rounded-lg hover:bg-surface-container-high transition-colors group"
                      >
                        <div className="flex items-stretch pl-4 shrink-0">
                          <div className="relative w-4 flex flex-col items-center">
                            <div className="absolute top-0 left-1/2 w-[1.5px] bg-outline-variant/50" style={{ height: '50%' }} />
                            <div className="absolute top-1/2 left-1/2 w-2 h-[1.5px] bg-outline-variant/50" />
                            {!isLast && <div className="absolute bottom-0 left-1/2 w-[1.5px] bg-outline-variant/50" style={{ height: '50%' }} />}
                          </div>
                        </div>
                        <div className="flex-1 flex flex-col items-start py-2.5 pr-4 min-w-0 text-left">
                          <span className="text-sm font-medium text-on-surface truncate w-full">{result.label}</span>
                          <span className="text-xs text-on-surface-variant truncate w-full mt-0.5">{result.subtitle}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 ml-auto shrink-0">
          <Tooltip content="Live Monitor">
            <button
              onClick={() => navigate('/admin/live')}
              className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-surface shadow-sm flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <Video className="w-5 h-5" />
            </button>
          </Tooltip>
          <div ref={notificationRef} className="relative">
            <Tooltip content="Notifikasi">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-surface shadow-sm flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {unreadCount}
                  </span>
                )}
              </button>
            </Tooltip>
            {showNotifications && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-surface rounded-2xl shadow-lg border border-outline-variant overflow-hidden z-50 animate-fade-in-up-sm">
                <div className="px-4 py-3 border-b border-outline-variant">
                  <h3 className="text-sm font-bold text-on-surface">Notifikasi</h3>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center">
                      <Bell className="w-7 h-7 mx-auto mb-2 text-outline" />
                      <p className="text-sm text-on-surface-variant">Tidak ada notifikasi baru</p>
                    </div>
                  ) : (
                    <div className="p-2">
                      {notifications.map((notif) => {
                        return (
                          <button
                            key={notif.id}
                            onClick={() => handleNotificationClick(notif)}
                            className={`w-full flex items-start gap-3 p-3 rounded-xl transition-colors ${notif.route ? 'hover:bg-surface-container-low cursor-pointer' : 'cursor-default'}`}
                          >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${notif.color}`}>
                              {NOTIF_ICONS[notif.type] || <Bell className="w-5 h-5" />}
                            </div>
                            <div className="flex-1 text-left">
                              <p className="text-sm font-medium text-on-surface">{notif.title}</p>
                              <p className="text-xs text-on-surface-variant">{notif.description}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-3 ml-2">
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-full border border-outline-variant overflow-hidden flex items-center justify-center bg-primary-container text-on-primary-container font-bold text-sm">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover rounded-full" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <span className="text-sm font-medium text-on-surface hidden md:block">{user.name}</span>
            </div>
          )}
        </div>
      </header>

      {focused && (
        <div
          className="fixed inset-0 top-16 lg:top-20 z-40 bg-black/30 transition-opacity duration-200"
          onClick={close}
        />
      )}
    </>
  )
}

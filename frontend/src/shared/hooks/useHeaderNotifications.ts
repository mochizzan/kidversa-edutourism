import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../core/hooks/useAuth'
import { useConnectionStatus } from './useConnectionStatus'
import { openSSE, refreshAccessToken } from '../../core/services/backendClient'
import { notifications } from '../../core/services/notifications'
import { ROUTES } from '../../core/constants/app'
import type { Notification } from '../../core/types'

export interface HeaderNotification {
  id: string
  tenant_id?: string | null
  tenant_name?: string
  type: 'user_approval' | 'sync' | 'connection'
  title: string
  description: string
  route?: string
  color: string
  count?: number
}

export function useHeaderNotifications() {
  const { user, token } = useAuth()
  const { status: connectionStatus } = useConnectionStatus()
  const [notificationsState, setNotificationsState] = useState<HeaderNotification[]>([])
  const [realUnread, setRealUnread] = useState(0)
  const [acknowledged, setAcknowledged] = useState(false)

  // Connection-status notices are always shown, independent of SSE.
  const connectionNotifs = useCallback((): HeaderNotification[] => {
    const notifs: HeaderNotification[] = []
    if (connectionStatus === 'reconnecting') {
      notifs.push({
        id: 'offline',
        type: 'connection',
        title: 'Backend tidak tersedia',
        description: 'Menghubungkan kembali ke server…',
        color: 'text-orange-600 bg-orange-100',
      })
    }
    notifs.push({
      id: 'connection-status',
      type: 'connection',
      title:
        connectionStatus === 'online'
          ? 'Terhubung ke Server'
          : connectionStatus === 'degraded'
            ? 'Koneksi Terbatas'
            : 'Menghubungkan…',
      description: connectionStatus === 'online' ? 'Semua data tersinkronisasi' : 'Coba lagi nanti',
      color:
        connectionStatus === 'online'
          ? 'text-green-600 bg-green-100'
          : connectionStatus === 'degraded'
            ? 'text-blue-600 bg-blue-100'
            : 'text-orange-600 bg-orange-100',
    })
    return notifs
  }, [connectionStatus])

  const refresh = useCallback(async () => {
    if (!user) {
      setNotificationsState(connectionNotifs())
      setRealUnread(0)
      return
    }
    try {
      const { items, unread } = await notifications.list()
      const mapped: HeaderNotification[] = items.map((n: Notification) => {
        const tenantId = n.tenant_id || undefined
        const route = tenantId
          ? `${ROUTES.ADMIN.USERS}?filter=pending&tenant=${tenantId}`
          : `${ROUTES.ADMIN.USERS}?filter=pending`
        return {
          id: n.id,
          tenant_id: tenantId,
          tenant_name: n.title,
          type: 'user_approval',
          title: n.title || 'Pendaftaran Menunggu',
          description: n.message || 'Pengguna baru menunggu persetujuan',
          route,
          color: 'text-purple-600 bg-purple-100',
          count: 1,
        }
      })
      setNotificationsState([...mapped, ...connectionNotifs()])
      setRealUnread(unread)
    } catch {
      // Offline / transient failure — keep connection notices only.
      setNotificationsState(connectionNotifs())
    }
  }, [user, connectionNotifs])

  // Full-SSE subscription: a wake-up signal (notif:new / notif:update)
  // triggers a refetch of GET /api/notifications. No delta merge.
  //
  // Guard: only open the stream once the in-memory access token is ready.
  // On a cold reload the user is restored from sessionStorage BEFORE the token
  // is re-established via refresh, and EventSource cannot send a Bearer header
  // (only the session cookie). Opening prematurely would 401 (and auto-reconnect
  // would storm 401s). Waiting for `token` avoids that.
  useEffect(() => {
    if (!user || !token) {
      setNotificationsState(connectionNotifs())
      return
    }
    let closed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    const MAX_ATTEMPTS = 5

    const open = () => {
      if (closed) return
      let source: EventSource
      const onEvent = () => {
        void refresh()
      }
      source = openSSE('/api/notifications/stream', onEvent, {
        onError: () => {
          // EventSource auto-reconnects, but on a 401 it would loop forever.
          // Close it and retry after refreshing the token (backoff), with a cap.
          source.close()
          if (closed || attempts >= MAX_ATTEMPTS) return
          attempts++
          const delay = Math.min(1000 * 2 ** (attempts - 1), 8000)
          retryTimer = setTimeout(async () => {
            try {
              await refreshAccessToken()
            } catch {
              // token refresh failed; give up, connection watcher will retry.
              return
            }
            if (!closed) open()
          }, delay)
        },
      })
      source.onopen = () => {
        attempts = 0
        void refresh()
      }
      source.addEventListener('notif:new', onEvent)
      source.addEventListener('notif:update', onEvent)
    }

    void refresh()
    open()
    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [user, token, connectionNotifs, refresh])

  // Re-render connection notices when status changes.
  useEffect(() => {
    if (!user) return
    setNotificationsState((prev) => {
      const approvals = prev.filter((n) => n.type === 'user_approval')
      return [...approvals, ...connectionNotifs()]
    })
  }, [user, connectionNotifs])

  const acknowledge = useCallback(() => {
    setAcknowledged(true)
    void notifications.markAllRead().catch(() => {
      // Best-effort: SSE notif:update will confirm via refetch.
    })
  }, [])

  const unreadCount = acknowledged ? 0 : realUnread

  return { notifications: notificationsState, unreadCount, refresh, acknowledge }
}

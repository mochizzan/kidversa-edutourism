import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../core/hooks/useAuth'
import { useTenantStore } from '../../core/stores/tenantStore'
import { isSuperAdmin } from '../../core/utils/permissions'
import { openSSE, refreshAccessToken } from '../../core/services/backendClient'
import { notifications } from '../../core/services/notifications'
import { ROUTES } from '../../core/constants/app'
import type { Notification } from '../../core/types'

export interface HeaderNotification {
  id: string
  tenant_id?: string | null
  tenant_name?: string
  type: 'user_approval' | 'sync'
  title: string
  description: string
  route?: string
  color: string
  count?: number
}

export function useHeaderNotifications() {
  const { user, token } = useAuth()
  const { activeTenant } = useTenantStore()
  const [notificationsState, setNotificationsState] = useState<HeaderNotification[]>([])
  const [realUnread, setRealUnread] = useState(0)
  const [acknowledged, setAcknowledged] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setNotificationsState([])
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
      setNotificationsState([...mapped])
      setRealUnread(unread)
    } catch {
      // Offline / transient failure — keep the last known notices.
      setNotificationsState((prev) => prev.filter((n) => n.type === 'user_approval'))
    }
  }, [user])

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
      setNotificationsState([])
      return
    }
    // SUPER_ADMIN: the notification SSE stream is tenant-scoped (EventSource
    // can't send X-Tenant-Id, so the tenant travels as ?tenant_id=). Wait until
    // an active tenant is selected before opening — otherwise we open a
    // tenant-less stream the backend rejects with 400, and openSSE emits a
    // spurious warning. Non-SA roles carry the tenant in the JWT, so they skip
    // this gate. Depending on activeTenant also reconnects the stream when the
    // SUPER_ADMIN switches tenants.
    if (isSuperAdmin(user) && !activeTenant) {
      return
    }
    let closed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    // Tracks whether the current connection ever opened successfully. If it did,
    // a subsequent error is almost certainly a transient proxy/network drop
    // (e.g. Vite dev proxy recycling an idle socket), not an auth failure — so
    // we reconnect WITHOUT a token refresh and let it heal naturally.
    let everOpened = false
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
          // Close it and retry with backoff (capped).
          source.close()
          if (closed || attempts >= MAX_ATTEMPTS) return
          attempts++
          const delay = Math.min(1000 * 2 ** (attempts - 1), 8000)
          // Only force a token refresh when the connection never opened — that
          // signals a likely auth (401) failure. A drop after a healthy open is
          // a transient proxy/network error; reconnecting alone recovers it and
          // avoids an unnecessary token-refresh storm.
          const wasHealthy = everOpened
          retryTimer = setTimeout(async () => {
            if (closed) return
            if (!wasHealthy) {
              try {
                await refreshAccessToken()
              } catch {
                // token refresh failed; give up, connection watcher will retry.
                return
              }
            }
            if (!closed) open()
          }, delay)
        },
      })
      source.onopen = () => {
        attempts = 0
        everOpened = true
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
  }, [user, token, activeTenant, refresh])

  const acknowledge = useCallback(() => {
    setAcknowledged(true)
    void notifications.markAllRead().catch(() => {
      // Best-effort: SSE notif:update will confirm via refetch.
    })
  }, [])

  const unreadCount = acknowledged ? 0 : realUnread

  return { notifications: notificationsState, unreadCount, refresh, acknowledge }
}

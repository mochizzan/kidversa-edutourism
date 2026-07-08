import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../core/hooks/useAuth'
import { useConnectionStatus } from './useConnectionStatus'
import { getAll } from '../../core/services/storage/idb'
import type { User, Tenant } from '../../core/types'
import { UserRole, ApprovalStatus } from '../../core/types/enums'
import { isSuperAdmin, isAdmin } from '../../core/utils/permissions'
import { USERS_CHANGED_EVENT, ROUTES } from '../../core/constants/app'

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
  const { user } = useAuth()
  const { status: connectionStatus } = useConnectionStatus()
  const [notifications, setNotifications] = useState<HeaderNotification[]>([])

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([])
      return
    }

    const notifs: HeaderNotification[] = []

    if (connectionStatus === 'OFFLINE') {
      notifs.push({
        id: 'offline',
        type: 'connection',
        title: 'Mode Offline',
        description: 'Data disimpan secara lokal',
        color: 'text-orange-600 bg-orange-100',
      })
    }

    notifs.push({
      id: 'connection-status',
      type: 'connection',
      title: connectionStatus === 'CLOUD' ? 'Terhubung ke Cloud' : connectionStatus === 'EDGE' ? 'Mode Edge' : 'Offline',
      description: connectionStatus === 'CLOUD' ? 'Semua data tersinkronisasi' : 'Sinkronisasi tertunda',
      color: connectionStatus === 'CLOUD' ? 'text-green-600 bg-green-100' : connectionStatus === 'EDGE' ? 'text-blue-600 bg-blue-100' : 'text-orange-600 bg-orange-100',
    })

    const approvalRoles: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN]
    if (approvalRoles.includes(user.role)) {
      try {
        const users = await getAll<User>('users')
        const tenants = await getAll<Tenant>('tenants')
        const tenantMap = new Map(tenants.map((t) => [t.id, t]))

        const pendingUsers = users.filter((u) => u.approval_status === ApprovalStatus.PENDING)

        const relevantPending = pendingUsers.filter((pending) => {
          if (isSuperAdmin(user)) return true
          if (isAdmin(user)) return pending.tenant_id === user.tenant_id
          return false
        })

        const grouped = new Map<string, User[]>()
        for (const pending of relevantPending) {
          const tid = pending.tenant_id || '__global__'
          if (!grouped.has(tid)) grouped.set(tid, [])
          grouped.get(tid)!.push(pending)
        }

        for (const [tenantId, pendingList] of grouped) {
          const tenantName = tenantId === '__global__' ? 'Platform' : (tenantMap.get(tenantId)?.name || 'Unknown')
          const count = pendingList.length

          const route = isSuperAdmin(user)
            ? `${ROUTES.ADMIN.USERS}?filter=pending&tenant=${tenantId}`
            : `${ROUTES.ADMIN.USERS}?filter=pending`

          notifs.push({
            id: `approval-${tenantId}`,
            tenant_id: tenantId === '__global__' ? null : tenantId,
            tenant_name: tenantName,
            type: 'user_approval',
            title: isSuperAdmin(user)
              ? `${count} Pendaftaran Menunggu - ${tenantName}`
              : `${count} Pendaftaran Menunggu`,
            description: `${count} pengguna baru menunggu persetujuan`,
            route,
            color: 'text-purple-600 bg-purple-100',
            count,
          })
        }
      } catch {
        // ignore notification load errors
      }
    }

    setNotifications(notifs)
  }, [user, connectionStatus])

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    const handleUsersChanged = () => loadNotifications()
    window.addEventListener(USERS_CHANGED_EVENT, handleUsersChanged)
    return () => {
      clearInterval(interval)
      window.removeEventListener(USERS_CHANGED_EVENT, handleUsersChanged)
    }
  }, [loadNotifications])

  const unreadCount = notifications.filter(
    (n) => n.type === 'user_approval'
  ).length

  return { notifications, unreadCount, refresh: loadNotifications }
}

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../core/hooks/useAuth'
import { useConnectionStatus } from './useConnectionStatus'
import { userService } from '../../core/services/users'
import { tenantService } from '../../core/services/tenants'
import type { User } from '../../core/types'
import { UserRole, ApprovalStatus } from '../../core/types/enums'
import { isSuperAdmin, isAdmin } from '../../core/utils/permissions'
import { USERS_CHANGED_EVENT, ROUTES } from '../../core/constants/app'
import { useTenantStore } from '../../core/stores/tenantStore'

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
      title: connectionStatus === 'online' ? 'Terhubung ke Server' : connectionStatus === 'degraded' ? 'Koneksi Terbatas' : 'Menghubungkan…',
      description: connectionStatus === 'online' ? 'Semua data tersinkronisasi' : 'Coba lagi nanti',
      color: connectionStatus === 'online' ? 'text-green-600 bg-green-100' : connectionStatus === 'degraded' ? 'text-blue-600 bg-blue-100' : 'text-orange-600 bg-orange-100',
    })

    const approvalRoles: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN]
    if (approvalRoles.includes(user.role)) {
      // SUPER_ADMIN wajib punya active tenant agar /api/users (tenant-scoped)
      // tidak 400. Jika belum ter-select (mis. fetchTenants gagal), jangan
      // fetch user global — cukup tampilkan notifikasi koneksi yang sudah ada.
      const activeTenantId = useTenantStore.getState().activeTenant?.id ?? null
      if (user.role === UserRole.SUPER_ADMIN && !activeTenantId) {
        setNotifications(notifs)
        return
      }
      try {
        const [usersPage, tenantList] = await Promise.all([
          userService.getAll({ page: 1, limit: 1000 }),
          tenantService.getAll(),
        ])
        const users = usersPage.data
        const tenants = tenantList
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

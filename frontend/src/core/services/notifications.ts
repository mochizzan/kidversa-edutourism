import type { Notification } from '../types'
import { listRequest, voidRequest } from './apiEnvelope'
import { API_ROUTES } from '../constants/apiRoutes'

export interface NotificationListResult {
  items: Notification[]
  unread: number
}

export const notifications = {
  // GET /api/notifications → { data: Notification[], meta: { total } }.
  // `unread` is the badge count (meta.total).
  list: (): Promise<NotificationListResult> =>
    listRequest<Notification>(API_ROUTES.NOTIFICATIONS.BASE, { limit: 50 }).then((r) => ({
      items: r.data,
      unread: r.total,
    })),

  // POST /api/notifications/read-all → 204 (no body).
  markAllRead: (): Promise<void> => voidRequest('POST', API_ROUTES.NOTIFICATIONS.READ_ALL),

  // POST /api/notifications/:id/read → 204 (no body).
  markRead: (id: string): Promise<void> =>
    voidRequest('POST', API_ROUTES.NOTIFICATIONS.READ(id)),
}

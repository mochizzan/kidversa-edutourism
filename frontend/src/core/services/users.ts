import { apiRequest } from './backendClient'
import type { UserService } from './types'
import type { User, CreateUserDTO, UpdateUserDTO } from '../types'
import { listRequest, itemRequest, voidRequest } from './apiEnvelope'
import { normalizePhone } from '../utils/phone'
import { uploadMultipart } from './uploadMultipart'
import { API_ROUTES } from '../constants/apiRoutes'

export const userService: UserService = {
  getAll: (params) => listRequest<User>(API_ROUTES.USERS.BASE, params),

  getById: async (id) => {
    try {
      return await itemRequest<User>('GET', API_ROUTES.USERS.DETAIL(id))
    } catch (err) {
      // 404 → not found (idb always returned null).
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        return null
      }
      throw err
    }
  },

  create: (data: CreateUserDTO) =>
    itemRequest<User>('POST', API_ROUTES.USERS.BASE, {
      email: data.email,
      // Do NOT default a password — let the backend validate it as required.
      // If the caller omitted it, a plain `undefined` is sent (omitted from JSON).
      password: data.password,
      name: data.name,
      phone: normalizePhone(data.phone),
      role: data.role,
      tenant_id: data.tenant_id,
    }),

  update: (id, data: UpdateUserDTO) =>
    itemRequest<User>('PUT', API_ROUTES.USERS.DETAIL(id), {
      name: data.name,
      phone: normalizePhone(data.phone),
      role: data.role,
      is_active: data.is_active,
      avatar_url: data.avatar_url,
    }),

  deactivate: (id) => itemRequest<User>('POST', API_ROUTES.USERS.DEACTIVATE(id)),

  approve: (userId) => itemRequest<User>('POST', API_ROUTES.USERS.APPROVE(userId)),

  reject: (userId, _approverId, reason) =>
    itemRequest<User>('POST', API_ROUTES.USERS.REJECT(userId), reason ? { reason } : {}),

  remove: (userId) => voidRequest('DELETE', API_ROUTES.USERS.DETAIL(userId)),

  uploadAvatar: (id, file) => {
    const form = new FormData()
    form.append('file', file)
    return uploadMultipart<User>(API_ROUTES.USERS.AVATAR(id), form)
  },
}

// Self-service password change — used by the force-change-password flow for
// seeded/bootstrap demo accounts flagged `must_change_password`.
export const changePassword = (oldPassword: string, newPassword: string) =>
  apiRequest('POST', '/api/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  })

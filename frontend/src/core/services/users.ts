import type { UserService } from './types'
import type { User, CreateUserDTO, UpdateUserDTO } from '../types'
import { listRequest, itemRequest, voidRequest } from './apiEnvelope'
import { normalizePhone } from '../utils/phone'
import { uploadMultipart } from './uploadMultipart'

export const userService: UserService = {
  getAll: (params) => listRequest<User>('/api/users', params),

  getById: async (id) => {
    try {
      return await itemRequest<User>('GET', `/api/users/${id}`)
    } catch (err) {
      // 404 → not found (idb always returned null).
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        return null
      }
      throw err
    }
  },

  create: (data: CreateUserDTO) =>
    itemRequest<User>('POST', '/api/users', {
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
    itemRequest<User>('PUT', `/api/users/${id}`, {
      name: data.name,
      phone: normalizePhone(data.phone),
      role: data.role,
      is_active: data.is_active,
      avatar_url: data.avatar_url,
    }),

  deactivate: (id) => itemRequest<User>('POST', `/api/users/${id}/deactivate`),

  approve: (userId) => itemRequest<User>('POST', `/api/users/${userId}/approve`),

  reject: (userId, _approverId, reason) =>
    itemRequest<User>('POST', `/api/users/${userId}/reject`, reason ? { reason } : {}),

  remove: (userId) => voidRequest('DELETE', `/api/users/${userId}`),

  uploadAvatar: (id, file) => {
    const form = new FormData()
    form.append('file', file)
    return uploadMultipart<User>(`/api/users/${id}/avatar`, form)
  },
}

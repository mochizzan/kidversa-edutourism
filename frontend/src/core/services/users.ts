import type { UserService } from './types'
import type { User, CreateUserDTO, UpdateUserDTO } from '../types'
import { listRequest, itemRequest, voidRequest } from './apiEnvelope'

// normalizePhone transforms an Indonesian phone number to E.164 (+62...).
// It strips leading 0 / 62 / +62 and re-prepends +62; invalid/empty input is
// returned untouched so the backend can surface a validation error.
function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined
  const trimmed = phone.trim()
  if (!trimmed) return undefined
  const digits = trimmed.replace(/[^\d]/g, '')
  if (digits.length === 0) return undefined
  let national: string
  if (digits.startsWith('62')) {
    national = digits.slice(2)
  } else if (digits.startsWith('0')) {
    national = digits.slice(1)
  } else {
    national = digits
  }
  // Indonesian mobile numbers are 9-13 digits after the country code.
  if (national.length < 7 || national.length > 13) return trimmed
  return `+62${national}`
}

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
}

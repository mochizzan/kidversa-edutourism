import type { PaginatedResponse, ListParams, User, CreateUserDTO, UpdateUserDTO } from '../../types'
import type { UserService } from '../types'
import { ApprovalStatus } from '../../types'
import { getAll as idbGetAll, getById as idbGetById, put } from '../storage/idb'
import { AppError } from '../../utils/errors'
import { dispatchUsersChanged } from '../../constants/app'
import { requireTenantId } from '../tenantScope'

const getAll = async (params?: ListParams): Promise<PaginatedResponse<User>> => {
  await new Promise((r) => setTimeout(r, 200))
  let data = await idbGetAll<User>('users')

  if (params?.search) {
    const q = params.search.toLowerCase()
    data = data.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }

  if (params?.filters?.role) {
    data = data.filter((u) => u.role === params.filters!.role)
  }

  if (params?.filters?.approval_status) {
    data = data.filter((u) => u.approval_status === params.filters!.approval_status)
  }

  if (params?.filters?.is_active !== undefined) {
    const active = params.filters!.is_active === true || params.filters!.is_active === 'true'
    data = data.filter((u) => u.is_active === active)
  }

  if (params?.filters?.tenant_id) {
    data = data.filter((u) => u.tenant_id === params.filters!.tenant_id)
  }

  const page = params?.page ?? 1
  const limit = params?.limit ?? 10
  const start = (page - 1) * limit

  return {
    data: data.slice(start, start + limit),
    total: data.length,
    page,
    limit,
    totalPages: Math.ceil(data.length / limit),
  }
}

const getById = async (id: string): Promise<User | null> => {
  await new Promise((r) => setTimeout(r, 100))
  return await idbGetById<User>('users', id)
}

const create = async (data: CreateUserDTO): Promise<User> => {
  await new Promise((r) => setTimeout(r, 300))
  const tenantId = requireTenantId(data.tenant_id)

  const user: User = {
    id: `u-${Date.now()}`,
    tenant_id: tenantId,
    email: data.email,
    password_hash: data.password ?? 'hashed',
    role: data.role,
    name: data.name,
    phone: data.phone,
    avatar_url: data.avatar_url,
    is_active: true,
    approval_status: ApprovalStatus.APPROVED,
    created_at: new Date().toISOString(),
  }

  await put('users', user)
  dispatchUsersChanged()
  return user
}

const update = async (id: string, data: UpdateUserDTO): Promise<User> => {
  await new Promise((r) => setTimeout(r, 300))

  const existing = await idbGetById<User>('users', id)
  if (!existing) {
    throw new AppError('NOT_FOUND', 'User tidak ditemukan')
  }

  const updated = { ...existing, ...data }
  await put('users', updated)
  dispatchUsersChanged()
  return updated
}

const deactivate = async (id: string): Promise<User> => {
  await new Promise((r) => setTimeout(r, 250))

  const user = await idbGetById<User>('users', id)
  if (!user) {
    throw new AppError('NOT_FOUND', 'User tidak ditemukan')
  }

  user.is_active = false
  await put('users', user)
  dispatchUsersChanged()
  return user
}

const approve = async (userId: string, approverId: string): Promise<User> => {
  await new Promise((r) => setTimeout(r, 250))

  const user = await idbGetById<User>('users', userId)
  if (!user) {
    throw new AppError('NOT_FOUND', 'User tidak ditemukan')
  }

  const updated: User = {
    ...user,
    approval_status: ApprovalStatus.APPROVED,
    is_active: true,
    approved_at: new Date().toISOString(),
    approved_by: approverId,
    rejected_at: undefined,
    rejected_by: undefined,
    rejection_reason: undefined,
  }

  await put('users', updated)
  dispatchUsersChanged()
  return updated
}

const reject = async (userId: string, approverId: string, reason?: string): Promise<User> => {
  await new Promise((r) => setTimeout(r, 250))

  const user = await idbGetById<User>('users', userId)
  if (!user) {
    throw new AppError('NOT_FOUND', 'User tidak ditemukan')
  }

  const updated: User = {
    ...user,
    approval_status: ApprovalStatus.REJECTED,
    is_active: false,
    rejected_at: new Date().toISOString(),
    rejected_by: approverId,
    rejection_reason: reason,
    approved_at: undefined,
    approved_by: undefined,
  }

  await put('users', updated)
  dispatchUsersChanged()
  return updated
}

export const mockUserService: UserService = {
  getAll,
  getById,
  create,
  update,
  deactivate,
  approve,
  reject,
}

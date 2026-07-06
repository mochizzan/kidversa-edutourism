import type { PaginatedResponse, ListParams, User, CreateUserDTO, UpdateUserDTO } from '../../types'
import type { UserService } from '../types'
import { seedUsers } from './data/seed'
import { mockStorage } from './db'

const STORAGE_KEY = 'users_v1'

const init = (): User[] => {
  const existing = mockStorage.get<User[]>(STORAGE_KEY, [])
  if (existing.length) return existing
  mockStorage.set(STORAGE_KEY, seedUsers)
  return seedUsers
}

const getAll = async (params?: ListParams): Promise<PaginatedResponse<User>> => {
  await new Promise((r) => setTimeout(r, 200))
  let data = init()
  if (params?.search) {
    const q = params.search.toLowerCase()
    data = data.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }
  if (params?.filters?.role) {
    const role = params.filters!.role
    data = data.filter((u) => u.role === role)
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
  return init().find((u) => u.id === id) ?? null
}

const create = async (data: CreateUserDTO): Promise<User> => {
  await new Promise((r) => setTimeout(r, 300))
  const users = init()
    const user: User = {
    id: `u-${Date.now()}`,
    tenant_id: data.tenant_id,
    email: data.email,
    password_hash: data.password ?? 'hashed',
    role: data.role,
    name: data.name,
    phone: data.phone,
    avatar_url: data.avatar_url,
    is_active: true,
    created_at: new Date().toISOString(),
  }
  users.push(user)
  mockStorage.set(STORAGE_KEY, users)
  return user
}

const update = async (id: string, data: UpdateUserDTO): Promise<User> => {
  await new Promise((r) => setTimeout(r, 300))
  const users = init()
  const idx = users.findIndex((u) => u.id === id)
  if (idx === -1) throw new Error('User not found')
  users[idx] = { ...users[idx], ...data }
  mockStorage.set(STORAGE_KEY, users)
  return users[idx]
}

const deactivate = async (id: string): Promise<User> => {
  await new Promise((r) => setTimeout(r, 250))
  const users = init()
  const user = users.find((u) => u.id === id)
  if (!user) throw new Error('User not found')
  user.is_active = !user.is_active
  mockStorage.set(STORAGE_KEY, users)
  return user
}

export const mockUserService: UserService = {
  getAll,
  getById,
  create,
  update,
  deactivate,
}

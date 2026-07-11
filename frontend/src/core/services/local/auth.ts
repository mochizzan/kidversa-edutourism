import type { AuthService } from '../types'
import type { LoginDTO, LoginResponse, User, CreateUserDTO } from '../../types'
import { ApprovalStatus } from '../../types'
import { getAll, put, getById } from '../storage/idb'
import { BOOTSTRAP_USERS, runBootstrap } from './bootstrap'
import { dispatchUsersChanged } from '../../constants/app'

const TOKEN_KEY = 'kidversa_access_token'
const REFRESH_TOKEN_KEY = 'kidversa_refresh_token'
const USER_KEY = 'kidversa_user'

function generateToken(userId: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    sub: userId,
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000,
  }))
  const signature = btoa(`local-signature-${userId}-${Date.now()}`)
  return `${header}.${payload}.${signature}`
}

function extractUserIdFromToken(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    if (payload.exp && payload.exp < Date.now()) return null
    return payload.sub
  } catch {
    return null
  }
}

export const authSession = {
  getToken(): string | null {
    return sessionStorage.getItem(TOKEN_KEY)
  },
  getRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY)
  },
  getUser(): User | null {
    const raw = sessionStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as User
    } catch {
      return null
    }
  },
  setToken(token: string): void {
    sessionStorage.setItem(TOKEN_KEY, token)
  },
  setRefreshToken(token: string): void {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
  },
  setUser(user: User): void {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  clear(): void {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
  },
}

async function getAllUsers(): Promise<User[]> {
  await runBootstrap()
  return getAll<User>('users')
}

async function findUserByEmail(email: string): Promise<User | null> {
  const users = await getAllUsers()
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null
}

function delay(ms = 200): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const localAuthService: AuthService = {
  async login(data: LoginDTO): Promise<LoginResponse> {
    await delay()
    
    const bootstrapUser = BOOTSTRAP_USERS.find(
      u => u.email.toLowerCase() === data.email.toLowerCase() && u.password_hash === data.password
    )
    
    if (bootstrapUser) {
      const idbUser = await getById<User>('users', bootstrapUser.id)
      const user = idbUser || bootstrapUser
      
      if (user.approval_status === ApprovalStatus.PENDING) {
        throw new Error('ACCOUNT_PENDING')
      }
      if (user.approval_status === ApprovalStatus.REJECTED) {
        throw new Error('ACCOUNT_REJECTED')
      }
      if (!user.is_active) {
        throw new Error('ACCOUNT_INACTIVE')
      }
      
      const { password_hash: _, ...userWithoutPassword } = user
      const cleanUser: User = { ...userWithoutPassword, password_hash: '' }
      
      const accessToken = generateToken(user.id)
      const refreshToken = generateToken(user.id)
      
      authSession.setToken(accessToken)
      authSession.setRefreshToken(refreshToken)
      authSession.setUser(cleanUser)
      
      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: cleanUser,
      }
    }
    
    const user = await findUserByEmail(data.email)
    
    if (!user) {
      throw new Error('EMAIL_NOT_FOUND')
    }
    
    if (user.password_hash !== data.password) {
      throw new Error('INVALID_PASSWORD')
    }
    
    if (user.approval_status === ApprovalStatus.PENDING) {
      throw new Error('ACCOUNT_PENDING')
    }
    if (user.approval_status === ApprovalStatus.REJECTED) {
      throw new Error('ACCOUNT_REJECTED')
    }
    if (!user.is_active) {
      throw new Error('ACCOUNT_INACTIVE')
    }
    
    const { password_hash: _, ...userWithoutPassword } = user
    const cleanUser: User = { ...userWithoutPassword, password_hash: '' }
    
    const accessToken = generateToken(user.id)
    const refreshToken = generateToken(user.id)
    
    authSession.setToken(accessToken)
    authSession.setRefreshToken(refreshToken)
    authSession.setUser(cleanUser)
    
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: cleanUser,
    }
  },

  async refresh(refreshToken: string): Promise<LoginResponse> {
    await delay(100)
    
    const userId = extractUserIdFromToken(refreshToken)
    if (!userId) {
      throw new Error('INVALID_REFRESH_TOKEN')
    }
    
    const user = await getById<User>('users', userId)
    if (!user || !user.is_active) {
      throw new Error('USER_NOT_FOUND')
    }
    
    const { password_hash: _, ...userWithoutPassword } = user
    const cleanUser: User = { ...userWithoutPassword, password_hash: '' }
    
    const newAccessToken = generateToken(user.id)
    const newRefreshToken = generateToken(user.id)
    
    authSession.setToken(newAccessToken)
    authSession.setRefreshToken(newRefreshToken)
    authSession.setUser(cleanUser)
    
    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      user: cleanUser,
    }
  },

  async logout(): Promise<void> {
    await delay(100)
    authSession.clear()
  },

  async getMe(): Promise<User> {
    await delay(100)
    
    const token = authSession.getToken()
    if (!token) {
      throw new Error('NO_TOKEN')
    }
    
    const userId = extractUserIdFromToken(token)
    if (!userId) {
      throw new Error('INVALID_TOKEN')
    }
    
    const user = await getById<User>('users', userId)
    if (!user) {
      throw new Error('USER_NOT_FOUND')
    }
    
    const { password_hash: _, ...userWithoutPassword } = user
    return { ...userWithoutPassword, password_hash: '' }
  },

  async generateKioskToken(_sessionId: string): Promise<{ access_token: string }> {
    await delay(100)
    const token = generateToken(`kiosk-${Date.now()}`)
    return { access_token: token }
  },

  async generateParentToken(_reportId: string): Promise<{ access_token: string }> {
    await delay(100)
    const token = generateToken(`parent-${Date.now()}`)
    return { access_token: token }
  },
}

export async function registerUser(data: CreateUserDTO): Promise<User> {
  const users = await getAllUsers()
  
  const existing = users.find(u => u.email.toLowerCase() === data.email.toLowerCase())
  if (existing) {
    throw new Error('EMAIL_ALREADY_EXISTS')
  }
  
  const newUser: User = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    tenant_id: data.tenant_id || null,
    email: data.email,
    password_hash: data.password || '',
    role: data.role,
    name: data.name,
    phone: data.phone,
    avatar_url: data.avatar_url,
    is_active: false,
    approval_status: ApprovalStatus.PENDING,
    created_at: new Date().toISOString(),
  }
  
  await put('users', newUser)
  dispatchUsersChanged()
  
  const { password_hash: _, ...userWithoutPassword } = newUser
  return { ...userWithoutPassword, password_hash: '' }
}

export async function approveUser(userId: string, approverId: string): Promise<User> {
  const user = await getById<User>('users', userId)
  if (!user) {
    throw new Error('USER_NOT_FOUND')
  }
  
  const updatedUser: User = {
    ...user,
    approval_status: ApprovalStatus.APPROVED,
    is_active: true,
    approved_at: new Date().toISOString(),
    approved_by: approverId,
    rejected_at: undefined,
    rejected_by: undefined,
    rejection_reason: undefined,
  }
  
  await put('users', updatedUser)
  dispatchUsersChanged()
  
  const { password_hash: _, ...userWithoutPassword } = updatedUser
  return { ...userWithoutPassword, password_hash: '' }
}

export async function rejectUser(userId: string, approverId: string, reason?: string): Promise<User> {
  const user = await getById<User>('users', userId)
  if (!user) {
    throw new Error('USER_NOT_FOUND')
  }
  
  const updatedUser: User = {
    ...user,
    approval_status: ApprovalStatus.REJECTED,
    is_active: false,
    rejected_at: new Date().toISOString(),
    rejected_by: approverId,
    rejection_reason: reason,
    approved_at: undefined,
    approved_by: undefined,
  }
  
  await put('users', updatedUser)
  dispatchUsersChanged()
  
  const { password_hash: _, ...userWithoutPassword } = updatedUser
  return { ...userWithoutPassword, password_hash: '' }
}

export async function deactivateUser(userId: string): Promise<User> {
  const user = await getById<User>('users', userId)
  if (!user) {
    throw new Error('USER_NOT_FOUND')
  }
  
  const updatedUser: User = {
    ...user,
    is_active: false,
  }
  
  await put('users', updatedUser)
  dispatchUsersChanged()
  
  const { password_hash: _, ...userWithoutPassword } = updatedUser
  return { ...userWithoutPassword, password_hash: '' }
}

export { runBootstrap }

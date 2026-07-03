import type { AuthService } from '../types'
import type { LoginDTO, LoginResponse, User, CreateUserDTO } from '../../types'
import { MOCK_ACCOUNTS } from '../../config/mock-accounts'
import { mockStorage } from './db'

// Session storage keys
const TOKEN_KEY = 'kidversa_access_token'
const REFRESH_TOKEN_KEY = 'kidversa_refresh_token'
const USER_KEY = 'kidversa_user'

// Generate mock JWT-like token
function generateMockToken(userId: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    sub: userId,
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  }))
  const signature = btoa(`mock-signature-${userId}-${Date.now()}`)
  return `${header}.${payload}.${signature}`
}

// Extract user ID from mock token
function extractUserIdFromToken(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    // Check expiry
    if (payload.exp && payload.exp < Date.now()) return null
    return payload.sub
  } catch {
    return null
  }
}

// Session storage helpers
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

// Get all accounts (seed + any registered users)
function getAllAccounts() {
  const registered = mockStorage.get<User[]>('registered_users', [])
  const seedAccounts = MOCK_ACCOUNTS.map((a) => ({
    id: a.id,
    tenant_id: a.tenant_id,
    email: a.email,
    password_hash: a.password, // mock: plain text
    role: a.role,
    name: a.name,
    phone: a.phone,
    is_active: a.is_active,
    created_at: '2026-01-01T00:00:00.000Z',
  }))
  return [...seedAccounts, ...registered]
}

// Simulate network delay
function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const mockAuthService: AuthService = {
  async login(data: LoginDTO): Promise<LoginResponse> {
    await delay()

    const accounts = getAllAccounts()
    const account = accounts.find((a) => a.email === data.email)

    if (!account) {
      throw new Error('EMAIL_NOT_FOUND')
    }

    // Mock: compare plain text password
    if (account.password_hash !== data.password) {
      throw new Error('INVALID_PASSWORD')
    }

    if (!account.is_active) {
      throw new Error('ACCOUNT_INACTIVE')
    }

    const { password_hash: _, ...userWithoutPassword } = account
    const user: User = { ...userWithoutPassword, password_hash: '' }

    const accessToken = generateMockToken(user.id)
    const refreshToken = generateMockToken(user.id)

    // Store in sessionStorage
    authSession.setToken(accessToken)
    authSession.setRefreshToken(refreshToken)
    authSession.setUser(user)

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user,
    }
  },

  async refresh(refreshToken: string): Promise<LoginResponse> {
    await delay(200)

    const userId = extractUserIdFromToken(refreshToken)
    if (!userId) {
      throw new Error('INVALID_REFRESH_TOKEN')
    }

    const accounts = getAllAccounts()
    const account = accounts.find((a) => a.id === userId)
    if (!account || !account.is_active) {
      throw new Error('USER_NOT_FOUND')
    }

    const { password_hash: _, ...userWithoutPassword } = account
    const user: User = { ...userWithoutPassword, password_hash: '' }

    const newAccessToken = generateMockToken(user.id)
    const newRefreshToken = generateMockToken(user.id)

    authSession.setToken(newAccessToken)
    authSession.setRefreshToken(newRefreshToken)
    authSession.setUser(user)

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      user,
    }
  },

  async logout(): Promise<void> {
    await delay(100)
    authSession.clear()
  },

  async getMe(): Promise<User> {
    await delay(200)

    const token = authSession.getToken()
    if (!token) {
      throw new Error('NO_TOKEN')
    }

    const userId = extractUserIdFromToken(token)
    if (!userId) {
      throw new Error('INVALID_TOKEN')
    }

    const accounts = getAllAccounts()
    const account = accounts.find((a) => a.id === userId)
    if (!account) {
      throw new Error('USER_NOT_FOUND')
    }

    const { password_hash: _, ...userWithoutPassword } = account
    return { ...userWithoutPassword, password_hash: '' }
  },

  async generateKioskToken(_sessionId: string): Promise<{ access_token: string }> {
    await delay(200)
    return { access_token: generateMockToken('kiosk') }
  },

  async generateParentToken(_reportId: string): Promise<{ access_token: string }> {
    await delay(200)
    return { access_token: generateMockToken('parent') }
  },
}

// Register function (not part of AuthService interface, but needed for register flow)
export async function registerUser(data: CreateUserDTO): Promise<User> {
  await delay(400)

  const accounts = getAllAccounts()
  const existingUser = accounts.find((a) => a.email === data.email)
  if (existingUser) {
    throw new Error('EMAIL_EXISTS')
  }

  const newUser: User = {
    id: `u-${Date.now()}`,
    tenant_id: data.tenant_id || 't-1',
    email: data.email,
    password_hash: data.password || '',
    role: data.role,
    name: data.name,
    phone: data.phone,
    is_active: true,
    created_at: new Date().toISOString(),
  }

  // Save to localStorage via mockStorage
  const registeredUsers = mockStorage.get<User[]>('registered_users', [])
  registeredUsers.push(newUser)
  mockStorage.set('registered_users', registeredUsers)

  return newUser
}

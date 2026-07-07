import type { AuthService } from '../types'
import type { LoginDTO, LoginResponse, User, CreateUserDTO } from '../../types'
import { ApprovalStatus } from '../../types'
import { MOCK_ACCOUNTS } from '../../config/mock-accounts'
import { getAll, put } from '../storage/idb'
import { requireTenantId } from '../tenantScope'

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

// Get all accounts (seed + any registered users from IDB)
async function getAllAccounts(): Promise<User[]> {
  const usersFromIDB = await getAll<User>('users')
  const seedAccounts = MOCK_ACCOUNTS.map((a) => ({
    id: a.id,
    tenant_id: a.tenant_id,
    email: a.email,
    password_hash: a.password, // mock: plain text
    role: a.role,
    name: a.name,
    phone: a.phone,
    is_active: a.is_active,
    approval_status: ApprovalStatus.APPROVED,
    created_at: '2026-01-01T00:00:00.000Z',
  }))

  // Merge: IDB users overlay seed accounts (by id)
  const accountsMap = new Map<string, User>()
  
  for (const acc of seedAccounts) {
    accountsMap.set(acc.id, acc)
  }
  
  for (const u of usersFromIDB) {
    const existing = accountsMap.get(u.id)
    if (existing) {
      // Overlay profile fields, preserve password_hash from seed
      accountsMap.set(u.id, {
        ...existing,
        name: u.name,
        email: u.email,
        phone: u.phone,
        avatar_url: u.avatar_url,
        is_active: u.is_active,
      })
    } else {
      // New registered user
      accountsMap.set(u.id, u)
    }
  }

  return Array.from(accountsMap.values())
}

// Simulate network delay
function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const mockAuthService: AuthService = {
  async login(data: LoginDTO): Promise<LoginResponse> {
    await delay()

    const accounts = await getAllAccounts()
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

    const accounts = await getAllAccounts()
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

    const accounts = await getAllAccounts()
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

  const accounts = await getAllAccounts()
  const existingUser = accounts.find((a) => a.email === data.email)
  if (existingUser) {
    throw new Error('EMAIL_EXISTS')
  }

  const tenantId = requireTenantId(data.tenant_id)
  const newUser: User = {
    id: `u-${Date.now()}`,
    tenant_id: tenantId,
    email: data.email,
    password_hash: data.password || '',
    role: data.role,
    name: data.name,
    phone: data.phone,
    is_active: true,
    approval_status: ApprovalStatus.APPROVED,
    created_at: new Date().toISOString(),
  }

  // Save to IndexedDB
  await put('users', newUser)

  return newUser
}

import { create } from 'zustand'
import type { User } from '../types'
import type { CreateUserDTO } from '../types'
import { UserRole } from '../types'
import { ROUTES } from '../constants/app'
import {
  apiRequest,
  getTokens,
  setTokens,
  clearTokens,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
} from '../services/backendClient'

// Role-based redirect map
const ROLE_REDIRECTS: Record<string, string> = {
  [UserRole.SUPER_ADMIN]: ROUTES.ADMIN.TENANTS,
  [UserRole.ADMIN]: ROUTES.ADMIN.DASHBOARD,
  [UserRole.KOORDINATOR]: ROUTES.ADMIN.DASHBOARD,
  [UserRole.FASILITATOR]: ROUTES.FASILITATOR.DASHBOARD,
}

// Module-level unauthorized handler. App registers a SPA navigator here so
// that any caught 401 (refresh already failed in backendClient) routes to
// login without a full page reload. Defaults to a hard redirect.
let onUnauthorized: (() => void) | null = null

export function registerUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

// Called when an ApiError with status 401 surfaces outside the initial
// checkSession flow (the refresh-retry already failed in backendClient).
// Clears tokens and routes to the login screen.
export function redirectToLogin(): void {
  clearTokens()
  clearStoredUser()
  if (onUnauthorized) {
    onUnauthorized()
  } else {
    window.location.assign(ROUTES.AUTH.LOGIN)
  }
}

// Backend envelope: every response is `{ data: ... }`.
interface LoginResponseData {
  access_token: string
  refresh_token?: string
  user: User
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean

  login: (email: string, password: string) => Promise<void>
  register: (data: CreateUserDTO) => Promise<User>
  logout: () => Promise<void>
  checkSession: () => Promise<void>
  setUser: (user: User) => void
  getRedirectPath: () => string
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true, // start as loading until checkSession runs

  login: async (email: string, password: string) => {
    const res = await apiRequest<{ data: LoginResponseData }>(
      'POST',
      '/api/auth/login',
      { email, password },
    )
    const { access_token, refresh_token, user } = res.data

    // Persist the access token (in-memory) and the user (sessionStorage) so
    // checkSession can restore the session after a page reload.
    setTokens(access_token, refresh_token)
    setStoredUser(user)

    set({
      user,
      token: access_token,
      isAuthenticated: true,
      isLoading: false,
    })
  },

  register: async (data: CreateUserDTO) => {
    // Transform Indonesian phone numbers to E.164 (+62...) at the service boundary.
    const phone = data.phone
      ? (() => {
          const digits = data.phone.replace(/[^\d]/g, '')
          const national = digits.startsWith('62')
            ? digits.slice(2)
            : digits.startsWith('0')
              ? digits.slice(1)
              : digits
          return national.length >= 7 && national.length <= 13 ? `+62${national}` : data.phone
        })()
      : undefined
    const res = await apiRequest<{ data: User }>('POST', '/api/auth/register', {
      name: data.name,
      email: data.email,
      password: data.password,
      phone,
      tenant_id: data.tenant_id,
      role: data.role,
    })
    return res.data
  },

  logout: async () => {
    // Best-effort backend logout (clears the session cookie server-side).
    try {
      await apiRequest('POST', '/api/auth/logout')
    } catch {
      // Ignore network/401 — local cleanup still happens.
    }
    clearTokens()
    clearStoredUser()
    set({
      user: null,
      token: null,
      isAuthenticated: false,
    })
  },

  checkSession: async () => {
    set({ isLoading: true })
    try {
      // Restore the user captured at login (full record) from sessionStorage.
      const storedUser = getStoredUser<User>()
      if (!storedUser) {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        })
        return
      }

      // Optimistically restore the session; the in-memory token may be null
      // after a reload, but the backend authenticates via the session cookie.
      set({
        user: storedUser,
        token: getTokens().accessToken,
        isAuthenticated: true,
      })

      // Validate the session against the backend. /me returns only a minimal
      // user — we do NOT replace our full stored user with it.
      try {
        await apiRequest('GET', '/api/auth/me')
        set({ isLoading: false })
      } catch (err) {
        // A 401 means the session is no longer valid → clear it.
        if (err instanceof Error && 'status' in err && (err as { status: number }).status === 401) {
          await get().logout()
        } else {
          set({ isLoading: false })
        }
      }
    } catch {
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },

  setUser: (user: User) => {
    set({ user })
  },

  getRedirectPath: () => {
    const { user } = get()
    if (!user) return ROUTES.AUTH.LOGIN
    return ROLE_REDIRECTS[user.role] || ROUTES.ADMIN.DASHBOARD
  },
}))

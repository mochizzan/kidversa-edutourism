import { create } from 'zustand'
import type { User } from '../types'
import type { CreateUserDTO } from '../types'
import { mockAuthService, authSession, registerUser } from '../services/mock/auth'
import { UserRole } from '../types'

// Role-based redirect map
const ROLE_REDIRECTS: Record<string, string> = {
  [UserRole.SUPER_ADMIN]: '/admin/dashboard',
  [UserRole.ADMIN_WISATA]: '/admin/dashboard',
  [UserRole.KOORDINATOR]: '/admin/dashboard',
  [UserRole.FASILITATOR]: '/fasilitator/dashboard',
  [UserRole.PARENT]: '/parent/dashboard',
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean

  login: (email: string, password: string) => Promise<void>
  register: (data: CreateUserDTO) => Promise<void>
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
    const response = await mockAuthService.login({ email, password })
    set({
      user: response.user,
      token: response.access_token,
      isAuthenticated: true,
    })
  },

  register: async (data: CreateUserDTO) => {
    // Register just creates the account, does not login
    await registerUser(data)
  },

  logout: async () => {
    await mockAuthService.logout()
    set({
      user: null,
      token: null,
      isAuthenticated: false,
    })
  },

  checkSession: async () => {
    set({ isLoading: true })
    try {
      const token = authSession.getToken()
      const user = authSession.getUser()

      if (token && user) {
        // Verify token is still valid by calling getMe
        const freshUser = await mockAuthService.getMe()
        set({
          user: freshUser,
          token,
          isAuthenticated: true,
          isLoading: false,
        })
      } else {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        })
      }
    } catch {
      // Token invalid or expired
      authSession.clear()
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
    authSession.setUser(user)
  },

  getRedirectPath: () => {
    const { user } = get()
    if (!user) return '/auth/login'
    return ROLE_REDIRECTS[user.role] || '/admin/dashboard'
  },
}))

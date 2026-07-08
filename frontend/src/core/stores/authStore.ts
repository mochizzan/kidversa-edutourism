import { create } from 'zustand'
import type { User } from '../types'
import type { CreateUserDTO } from '../types'
import { localAuthService, authSession, registerUser } from '../services/local/auth'
import { UserRole } from '../types'
import { ROUTES } from '../constants/app'

// Role-based redirect map
const ROLE_REDIRECTS: Record<string, string> = {
  [UserRole.SUPER_ADMIN]: ROUTES.ADMIN.TENANTS,
  [UserRole.ADMIN]: ROUTES.ADMIN.DASHBOARD,
  [UserRole.KOORDINATOR]: ROUTES.ADMIN.DASHBOARD,
  [UserRole.FASILITATOR]: ROUTES.FASILITATOR.DASHBOARD,
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
    const response = await localAuthService.login({ email, password })
    set({
      user: response.user,
      token: response.access_token,
      isAuthenticated: true,
    })
  },

  register: async (data: CreateUserDTO) => {
    await registerUser(data)
  },

  logout: async () => {
    await localAuthService.logout()
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
        const freshUser = await localAuthService.getMe()
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
    if (!user) return ROUTES.AUTH.LOGIN
    return ROLE_REDIRECTS[user.role] || ROUTES.ADMIN.DASHBOARD
  },
}))

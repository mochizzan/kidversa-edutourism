import { useAuthStore } from '../stores/authStore'

export const useAuth = () => {
  const {
    user,
    isAuthenticated,
    isLoading,
    mustChangePassword,
    login,
    logout,
    register,
    getRedirectPath,
  } = useAuthStore()

  return {
    user,
    isAuthenticated,
    isLoading,
    mustChangePassword,
    login,
    logout,
    register,
    getRedirectPath,
  }
}

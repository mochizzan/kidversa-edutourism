import { useAuthStore } from '../stores/authStore'

export const useAuth = () => {
  const {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    register,
    getRedirectPath,
  } = useAuthStore()

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    register,
    getRedirectPath,
  }
}

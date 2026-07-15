import { useAuthStore } from '../stores/authStore'

export const useAuth = () => {
  const {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    logout,
    register,
    getRedirectPath,
  } = useAuthStore()

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    logout,
    register,
    getRedirectPath,
  }
}

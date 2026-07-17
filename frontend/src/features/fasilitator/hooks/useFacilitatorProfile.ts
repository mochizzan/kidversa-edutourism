import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../core/hooks/useAuth'
import { ROUTES } from '../../../core/constants/app'
import { userService } from '../../../core/services/users'
import { useAuthStore } from '../../../core/stores/authStore'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import type { User as UserType } from '../../../core/types'

export function useFacilitatorProfile() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const { addToast } = useGlobalToast()

  const handleLogout = useCallback(async () => {
    await logout()
    navigate(ROUTES.AUTH.LOGIN, { replace: true })
  }, [logout, navigate])

  const handleAvatarUpload = useCallback(
    async (file: File) => {
      if (!user) return
      try {
        const updated = await userService.uploadAvatar(user.id, file)
        const { password_hash: _password, ...cleanUser } = updated
        setUser(cleanUser as UserType)
        addToast({ type: 'success', message: 'Foto profil berhasil diperbarui' })
      } catch (err) {
        addToast({ type: 'error', message: 'Gagal memperbarui foto profil' })
        throw err
      }
    },
    [user, setUser, addToast],
  )

  return { user, handleLogout, handleAvatarUpload }
}

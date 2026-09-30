import { useCallback } from 'react'
import { i18n } from '../../../core/i18n'
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
      if (!user) {
        // The store's user is gone (session torn down) — surface the relogin
        // copy instead of no-op'ing like ProfilePage's load-error card does.
        addToast({ type: 'error', message: i18n.t('fasilitator.edit.userNotFound') })
        return
      }
      try {
        const updated = await userService.uploadAvatar(user.id, file)
        const { password_hash: _password, ...cleanUser } = updated
        setUser(cleanUser as UserType)
        addToast({ type: 'success', message: i18n.t('fasilitator.profile.avatarUpdated') })
      } catch (err) {
        addToast({ type: 'error', message: i18n.t('fasilitator.profile.avatarError') })
        throw err
      }
    },
    [user, setUser, addToast],
  )

  return { user, handleLogout, handleAvatarUpload }
}

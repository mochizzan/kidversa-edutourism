import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Check, Lock } from 'lucide-react'
import { useAuthStore } from '../../../core/stores/authStore'
import { apiRequest, ApiError } from '../../../core/services/backendClient'
import { cn } from '../../../core/utils'

const ChangePasswordPage = () => {
  const navigate = useNavigate()
  const { user, getRedirectPath, setUser } = useAuthStore()

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // If there is no authenticated user, bounce back to login.
  if (!user && !success) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-on-surface-variant/60">
          Sesi tidak valid. Silakan masuk kembali.
        </p>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 6) {
      setError('Password baru minimal 6 karakter')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok')
      return
    }

    setIsSubmitting(true)
    try {
      await apiRequest('POST', '/api/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      })
      // Clear the forced flag in the store and continue into the app.
      if (user) {
        setUser({ ...user, must_change_password: false })
      }
      setSuccess(true)
      setTimeout(() => {
        navigate(getRedirectPath(), { replace: true })
      }, 1200)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'invalid_credentials') {
          setError('Password lama salah')
        } else if (err.code === 'validation_error') {
          setError('Password baru tidak memenuhi syarat')
        } else {
          setError(err.message || 'Terjadi kesalahan. Silakan coba lagi.')
        }
      } else {
        setError('Terjadi kesalahan. Silakan coba lagi.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-8 animate-fade-in-up">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-on-surface mb-1">Password Berhasil Diubah</h2>
        <p className="text-sm text-on-surface-variant/60 text-center max-w-[280px]">
          Anda akan diarahkan ke beranda…
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col items-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-lg shadow-primary/25 flex items-center justify-center mb-3">
          <Lock className="w-6 h-6 text-on-primary" />
        </div>
        <h2 className="text-xl font-bold text-on-surface tracking-tight text-center">
          Ubah Password
        </h2>
        <p className="text-sm text-on-surface-variant/60 mt-1.5 text-center max-w-[240px] leading-relaxed">
          Password Anda harus diubah pada login pertama.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 bg-error-container rounded-xl text-on-error-container text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
            Password Lama
          </label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200 bg-surface-container-low focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15 border-outline-variant/60 text-on-surface"
            placeholder="Password lama"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
            Password Baru
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200 bg-surface-container-low focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15 border-outline-variant/60 text-on-surface"
            placeholder="Password baru (min. 6 karakter)"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
            Konfirmasi Password Baru
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200 bg-surface-container-low focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15 border-outline-variant/60 text-on-surface"
            placeholder="Ulangi password baru"
            disabled={isSubmitting}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            'w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 mt-1',
            'bg-gradient-to-r from-primary to-primary-dark text-on-primary',
            'hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5',
            'active:scale-[0.98] active:translate-y-0',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center justify-center gap-2',
          )}
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-on-primary border-t-transparent" />
              <span>Memproses…</span>
            </>
          ) : (
            'Ubah Password'
          )}
        </button>
      </form>
    </>
  )
}

export default ChangePasswordPage

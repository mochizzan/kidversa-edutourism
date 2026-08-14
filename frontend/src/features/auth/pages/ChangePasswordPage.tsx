import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { useAuthStore } from '../../../core/stores/authStore'
import { friendlyError } from '../../../core/utils/errorMessages'
import { ROUTES } from '../../../core/constants/app'
import { changePassword } from '../../../core/services/users'
import { PasswordStrengthBar } from '../components/PasswordStrengthBar'
import { Logo } from '../../../shared/components/ui/Logo'
import { Button } from '../../../shared/components/ui/Button'

const changePasswordSchema = z
  .object({
    old_password: z.string().min(8, 'Password lama minimal 8 karakter'),
    new_password: z.string().min(8, 'Password baru minimal 8 karakter'),
    confirm: z.string(),
  })
  .refine((data) => data.new_password === data.confirm, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirm'],
  })

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>

const ChangePasswordPage = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const { isAuthenticated, user } = useAuth()
  const setUser = useAuthStore((s) => s.setUser)
  const returnUrl = searchParams.get('returnUrl') || ROUTES.ADMIN.DASHBOARD

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { old_password: '', new_password: '', confirm: '' },
  })

  // ── Guard: must be authenticated; bounce to dashboard if not required ──
  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`${ROUTES.AUTH.LOGIN}?returnUrl=${encodeURIComponent(location.pathname)}`, { replace: true })
      return
    }
    if (user && !user.must_change_password) {
      navigate(returnUrl, { replace: true })
    }
  }, [isAuthenticated, user, navigate, returnUrl, location.pathname])

  // ── Submit ──
  const onSubmit = async (data: ChangePasswordFormData) => {
    setGeneralError(null)
    setIsSubmitting(true)
    try {
      await changePassword(data.old_password, data.new_password)
      // Reflect the cleared flag locally so the route guards stop redirecting.
      if (user) setUser({ ...user, must_change_password: false })
      navigate(returnUrl, { replace: true })
    } catch (err) {
      setGeneralError(friendlyError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const newPassword = watch('new_password')

  return (
    <div className="max-w-sm mx-auto w-full">
      {/* ── Header ── */}
      <div className="flex flex-col items-center mb-7">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-lg shadow-primary/25 flex items-center justify-center mb-3">
          <Logo alt="Kidversa" className="w-8 h-8 object-contain" />
        </div>
        <h2 className="text-xl font-bold text-on-surface tracking-tight text-center">
          Ubah Password
        </h2>
        <p className="text-sm text-on-surface-variant/60 mt-1.5 text-center max-w-[240px] leading-relaxed">
          Demi keamanan, ubah password akun Anda sebelum melanjutkan.
        </p>
      </div>

      {/* ── Error ── */}
      {generalError && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 bg-error-container rounded-xl text-on-error-container text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{generalError}</span>
        </div>
      )}

      {/* ── Form ── */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Old password */}
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
            Password Lama
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              {...register('old_password')}
              className="w-full pl-10 pr-11 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200 bg-surface-container-low placeholder:text-on-surface-variant/35 focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15 text-on-surface"
              placeholder="Masukkan password lama"
              disabled={isSubmitting}
              aria-invalid={!!errors.old_password}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.old_password && (
            <p className="mt-1 text-xs text-error font-medium">{errors.old_password.message}</p>
          )}
        </div>

        {/* New password */}
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
            Password Baru
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              {...register('new_password')}
              className="w-full pl-10 pr-11 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200 bg-surface-container-low placeholder:text-on-surface-variant/35 focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15 text-on-surface"
              placeholder="Masukkan password baru"
              disabled={isSubmitting}
              aria-invalid={!!errors.new_password}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.new_password && (
            <p className="mt-1 text-xs text-error font-medium">{errors.new_password.message}</p>
          )}
          <PasswordStrengthBar password={newPassword || ''} />
        </div>

        {/* Confirm password */}
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
            Konfirmasi Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              {...register('confirm')}
              className="w-full pl-10 pr-11 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200 bg-surface-container-low placeholder:text-on-surface-variant/35 focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15 text-on-surface"
              placeholder="Ulangi password baru"
              disabled={isSubmitting}
              aria-invalid={!!errors.confirm}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.confirm && (
            <p className="mt-1 text-xs text-error font-medium">{errors.confirm.message}</p>
          )}
        </div>

        <Button
          type="submit"
          loading={isSubmitting}
          className="w-full py-2.5 bg-gradient-to-r from-primary to-primary-dark text-on-primary hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0"
        >
          Ubah Password
        </Button>
      </form>
    </div>
  )
}

export default ChangePasswordPage

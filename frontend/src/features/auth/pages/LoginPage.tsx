import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { MOCK_DEFAULT_PASSWORD } from '../../../core/config/mock-accounts'
import { cn } from '../../../core/utils'

// ── Rate limiting ──
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 5 * 60 * 1000
const ATTEMPTS_KEY = 'kidversa_login_attempts'
const LOCKOUT_KEY = 'kidversa_lockout_until'

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  honeypot: z.string().max(0).optional().or(z.literal('')),
})

type LoginFormData = z.infer<typeof loginSchema>

function getLoginAttempts(): number {
  const v = sessionStorage.getItem(ATTEMPTS_KEY)
  return v ? parseInt(v, 10) : 0
}
function setLoginAttempts(c: number) {
  sessionStorage.setItem(ATTEMPTS_KEY, String(c))
}
function getLockoutUntil(): number {
  const v = sessionStorage.getItem(LOCKOUT_KEY)
  return v ? parseInt(v, 10) : 0
}
function setLockoutUntil(ts: number) {
  sessionStorage.setItem(LOCKOUT_KEY, String(ts))
}
function clearRateLimit() {
  sessionStorage.removeItem(ATTEMPTS_KEY)
  sessionStorage.removeItem(LOCKOUT_KEY)
}

/* ── Component ── */
const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [lockoutTimeLeft, setLockoutTimeLeft] = useState(0)

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnUrl = searchParams.get('returnUrl') || '/admin/dashboard'
  const { login, isAuthenticated } = useAuth()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', honeypot: '' },
  })

  // ── Lockout check ──
  useEffect(() => {
    const check = () => {
      const until = getLockoutUntil()
      if (until > Date.now()) {
        setIsLocked(true)
        setLockoutTimeLeft(Math.ceil((until - Date.now()) / 1000))
      } else {
        setIsLocked(false)
        setLockoutTimeLeft(0)
      }
    }
    check()
    const iv = setInterval(check, 1000)
    return () => clearInterval(iv)
  }, [])

  // ── Redirect if authed ──
  useEffect(() => {
    if (isAuthenticated) navigate(returnUrl, { replace: true })
  }, [isAuthenticated, navigate, returnUrl])

  // ── Submit ──
  const onSubmit = useCallback(
    async (data: LoginFormData) => {
      setGeneralError(null)
      if (data.honeypot?.length) return
      if (getLockoutUntil() > Date.now()) { setIsLocked(true); return }

      try {
        await login(data.email, data.password)
        clearRateLimit()
      } catch (err) {
        const attempts = getLoginAttempts() + 1
        setLoginAttempts(attempts)
        if (attempts >= MAX_ATTEMPTS) {
          const end = Date.now() + LOCKOUT_DURATION
          setLockoutUntil(end)
          setIsLocked(true)
          setGeneralError('Terlalu banyak percobaan. Coba lagi dalam 5 menit.')
        } else {
          const remaining = MAX_ATTEMPTS - attempts
          if (err instanceof Error) {
            switch (err.message) {
              case 'EMAIL_NOT_FOUND':
              case 'INVALID_PASSWORD':
                setGeneralError(
                  `Email atau password salah. Sisa percobaan: ${remaining}`,
                )
                break
              case 'ACCOUNT_INACTIVE':
                setGeneralError('Akun tidak aktif. Hubungi administrator.')
                break
              default:
                setGeneralError('Terjadi kesalahan. Silakan coba lagi.')
            }
          } else {
            setGeneralError('Terjadi kesalahan. Silakan coba lagi.')
          }
        }
      }
    },
    [login],
  )

  return (
    <>
      {/* ── Header ── */}
      <div className="flex flex-col items-center mb-7">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-lg shadow-primary/25 flex items-center justify-center mb-3">
          <img
            src="/logo.png"
            alt="Kidversa"
            className="w-8 h-8 object-contain"
          />
        </div>
        <h2 className="text-xl font-bold text-on-surface tracking-tight text-center">
          Selamat datang kembali
        </h2>
        <p className="text-sm text-on-surface-variant/60 mt-1.5 text-center max-w-[220px] leading-relaxed">
          Masuk ke akun Kidversa Anda
        </p>
      </div>

      {/* ── Error ── */}
      {generalError && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 bg-error-container rounded-xl text-on-error-container text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{generalError}</span>
        </div>
      )}

      {isLocked && lockoutTimeLeft > 0 && (
        <div className="mb-4 p-3.5 bg-accent-50 border border-accent-200 rounded-xl text-accent-800 text-sm text-center">
          <p className="font-medium">Akun terkunci sementara</p>
          <p className="text-sm mt-0.5">
            Coba lagi dalam {Math.ceil(lockoutTimeLeft / 60)} menit{' '}
            {lockoutTimeLeft % 60} detik
          </p>
        </div>
      )}

      {/* ── Form ── */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Honeypot */}
        <div aria-hidden="true" className="absolute -left-[9999px] opacity-0 h-0 w-0 overflow-hidden pointer-events-none">
          <label htmlFor="login-website">Website</label>
          <input id="login-website" type="text" tabIndex={-1} autoComplete="off" {...register('honeypot')} />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40 pointer-events-none" />
            <input
              type="email"
              {...register('email')}
              className={cn(
                'w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200',
                'bg-surface-container-low',
                'placeholder:text-on-surface-variant/35',
                'focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15',
                errors.email
                  ? 'border-error text-on-surface'
                  : 'border-outline-variant/60 text-on-surface',
              )}
              placeholder="email@example.com"
              disabled={isSubmitting || isLocked}
              aria-invalid={!!errors.email}
            />
          </div>
          {errors.email && (
            <p className="mt-1 text-xs text-error font-medium">{errors.email.message}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              className={cn(
                'w-full pl-10 pr-11 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200',
                'bg-surface-container-low',
                'placeholder:text-on-surface-variant/35',
                'focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15',
                errors.password
                  ? 'border-error text-on-surface'
                  : 'border-outline-variant/60 text-on-surface',
              )}
              placeholder="Masukkan password"
              disabled={isSubmitting || isLocked}
              aria-invalid={!!errors.password}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-error font-medium">{errors.password.message}</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || isLocked}
          className={cn(
            'w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 mt-1',
            'bg-gradient-to-r from-primary to-primary-dark text-on-primary',
            'hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5',
            'active:scale-[0.98] active:translate-y-0',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0 disabled:hover:scale-100',
            'flex items-center justify-center gap-2',
          )}
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-on-primary border-t-transparent" />
              <span>Memproses…</span>
            </>
          ) : (
            'Masuk'
          )}
        </button>
      </form>

      {/* ── Divider ── */}
      <div className="flex items-center gap-3 my-5">
        <span className="flex-1 h-px bg-outline-variant/40" />
        <span className="text-[11px] text-on-surface-variant/40 font-medium tracking-wider uppercase">
          Info Demo
        </span>
        <span className="flex-1 h-px bg-outline-variant/40" />
      </div>

      {/* ── Demo hint ── */}
      <div className="p-3 rounded-xl bg-primary-container/40 border border-primary-100/60">
        <p className="text-xs text-on-primary-container/60 text-center leading-relaxed">
          <span className="font-semibold text-on-primary-container/80">Demo:</span>{' '}
          admin@kidversa.id / {MOCK_DEFAULT_PASSWORD}
        </p>
        <p className="text-[11px] text-on-primary-container/40 text-center mt-0.5">
          Juga tersedia: koordinator@kidversa.id &bull; f1@kidversa.id
        </p>
      </div>

      {/* ── Register link ── */}
      <p className="mt-6 text-center text-sm text-on-surface-variant/50">
        Belum punya akun?{' '}
        <Link
          to="/auth/register"
          className="text-primary font-semibold hover:text-primary-dark transition-colors"
        >
          Daftar sekarang
        </Link>
      </p>
    </>
  )
}

export default LoginPage

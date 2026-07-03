import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { MOCK_DEFAULT_PASSWORD } from '../../../core/config/mock-accounts'

// Rate limiting constants
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 5 * 60 * 1000 // 5 minutes
const ATTEMPTS_KEY = 'kidversa_login_attempts'
const LOCKOUT_KEY = 'kidversa_lockout_until'

// Zod schema
const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  honeypot: z.string().max(0, 'Robot terdeteksi').optional().or(z.literal('')),
})

type LoginFormData = z.infer<typeof loginSchema>

// Rate limiting helpers
function getLoginAttempts(): number {
  const val = sessionStorage.getItem(ATTEMPTS_KEY)
  return val ? parseInt(val, 10) : 0
}

function setLoginAttempts(count: number): void {
  sessionStorage.setItem(ATTEMPTS_KEY, String(count))
}

function getLockoutUntil(): number {
  const val = sessionStorage.getItem(LOCKOUT_KEY)
  return val ? parseInt(val, 10) : 0
}

function setLockoutUntil(timestamp: number): void {
  sessionStorage.setItem(LOCKOUT_KEY, String(timestamp))
}

function clearRateLimit(): void {
  sessionStorage.removeItem(ATTEMPTS_KEY)
  sessionStorage.removeItem(LOCKOUT_KEY)
}

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
    defaultValues: {
      email: '',
      password: '',
      honeypot: '',
    },
  })

  // Check lockout on mount
  useEffect(() => {
    const checkLockout = () => {
      const lockoutUntil = getLockoutUntil()
      if (lockoutUntil > Date.now()) {
        setIsLocked(true)
        setLockoutTimeLeft(Math.ceil((lockoutUntil - Date.now()) / 1000))
      } else {
        setIsLocked(false)
        setLockoutTimeLeft(0)
      }
    }

    checkLockout()
    const interval = setInterval(checkLockout, 1000)
    return () => clearInterval(interval)
  }, [])

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate(returnUrl, { replace: true })
    }
  }, [isAuthenticated, navigate, returnUrl])

  const onSubmit = useCallback(async (data: LoginFormData) => {
    setGeneralError(null)

    // Honeypot check
    if (data.honeypot && data.honeypot.length > 0) {
      // Silently reject
      return
    }

    // Rate limit check
    const lockoutUntil = getLockoutUntil()
    if (lockoutUntil > Date.now()) {
      setIsLocked(true)
      return
    }

    try {
      await login(data.email, data.password)
      // Success - clear rate limit
      clearRateLimit()
      // Navigation handled by useEffect above
    } catch (err) {
      const attempts = getLoginAttempts() + 1
      setLoginAttempts(attempts)

      if (attempts >= MAX_ATTEMPTS) {
        const lockoutEnd = Date.now() + LOCKOUT_DURATION
        setLockoutUntil(lockoutEnd)
        setIsLocked(true)
        setGeneralError(`Terlalu banyak percobaan. Coba lagi dalam ${LOCKOUT_DURATION / 60000} menit`)
      } else {
        const remaining = MAX_ATTEMPTS - attempts
        if (err instanceof Error) {
          switch (err.message) {
            case 'EMAIL_NOT_FOUND':
            case 'INVALID_PASSWORD':
              setGeneralError(
                remaining < MAX_ATTEMPTS
                  ? `Email atau password salah. Sisa percobaan: ${remaining}`
                  : 'Email atau password salah'
              )
              break
            case 'ACCOUNT_INACTIVE':
              setGeneralError('Akun tidak aktif. Hubungi administrator')
              break
            default:
              setGeneralError('Terjadi kesalahan. Silakan coba lagi')
          }
        } else {
          setGeneralError('Terjadi kesalahan. Silakan coba lagi')
        }
      }
    }
  }, [login])

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        Masuk ke Akun
      </h2>

      {/* General Error Alert */}
      {generalError && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{generalError}</span>
        </div>
      )}

      {/* Lockout Warning */}
      {isLocked && lockoutTimeLeft > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm text-center">
          <p className="font-medium">Akun terkunci sementara</p>
          <p>Coba lagi dalam {Math.ceil(lockoutTimeLeft / 60)} menit {lockoutTimeLeft % 60} detik</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Honeypot field - hidden from users */}
        <div
          style={{
            position: 'absolute',
            left: '-9999px',
            opacity: 0,
            height: 0,
            width: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          <label htmlFor="login-website">Website</label>
          <input
            id="login-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...register('honeypot')}
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="email"
              {...register('email')}
              className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${
                errors.email ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="email@example.com"
              disabled={isSubmitting || isLocked}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
            />
          </div>
          {errors.email && (
            <p id="login-email-error" className="mt-1 text-sm text-red-600">
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              className={`w-full pl-10 pr-12 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${
                errors.password ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Masukkan password"
              disabled={isSubmitting || isLocked}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && (
            <p id="login-password-error" className="mt-1 text-sm text-red-600">
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || isLocked}
          className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Memproses...</span>
            </>
          ) : (
            'Masuk'
          )}
        </button>
      </form>

      {/* Demo Hint */}
      <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-100">
        <p className="text-xs text-purple-700 text-center">
          <strong>Demo:</strong> admin@kidversa.id / {MOCK_DEFAULT_PASSWORD}
        </p>
        <p className="text-xs text-purple-500 text-center mt-1">
          Akun lain: koordinator@kidversa.id, f1@kidversa.id
        </p>
      </div>

      {/* Register link */}
      <p className="mt-6 text-center text-sm text-gray-600">
        Belum punya akun?{' '}
        <Link to="/auth/register" className="text-primary hover:text-primary-dark font-semibold">
          Daftar sekarang
        </Link>
      </p>
    </div>
  )
}

export default LoginPage

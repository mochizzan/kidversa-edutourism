import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { friendlyError } from '../../../core/utils/errorMessages'
import { useRateLimit } from '../hooks/useRateLimit'
import { ROUTES } from '../../../core/constants/app'
import { LoginForm } from '../components/LoginForm'
import { DemoHint } from '../components/DemoHint'
import { Logo } from '../../../shared/components/ui/Logo'

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  honeypot: z.string().max(0).optional().or(z.literal('')),
})

type LoginFormData = z.infer<typeof loginSchema>

const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, isAuthenticated, getRedirectPath } = useAuth()
  const returnUrl = searchParams.get('returnUrl') || getRedirectPath()
  const { isLocked, lockoutTimeLeft, recordFailedAttempt, clearRateLimit } = useRateLimit()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', honeypot: '' },
  })

  // Guard against double-submit (e.g. button clicked twice / repeated submit
  // events): ensure login() runs at most once per submit attempt.
  const submittedRef = useRef(false)

  // ── Redirect if authed ──
  useEffect(() => {
    if (isAuthenticated) navigate(returnUrl, { replace: true })
  }, [isAuthenticated, navigate, returnUrl])

  // ── Submit ──
  const onSubmit = async (data: LoginFormData) => {
    setGeneralError(null)
    if (data.honeypot?.length) return
    if (submittedRef.current) return
    submittedRef.current = true

    try {
      await login(data.email, data.password)
      clearRateLimit()
    } catch (err) {
      const isLockedNow = recordFailedAttempt()
      if (isLockedNow) {
        setGeneralError('Terlalu banyak percobaan. Coba lagi dalam 5 menit.')
      } else {
        setGeneralError(friendlyError(err))
      }
    } finally {
      submittedRef.current = false
    }
  }

  return (
    <>
      {/* ── Header ── */}
      <div className="flex flex-col items-center mb-7">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-lg shadow-primary/25 flex items-center justify-center mb-3">
          <Logo alt="Kidversa" className="w-8 h-8 object-contain" />
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

      {/* ── Lockout ── */}
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
      <form onSubmit={handleSubmit(onSubmit)}>
        <LoginForm
          register={register}
          errors={errors}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          isSubmitting={isSubmitting}
          isLocked={isLocked}
        />
      </form>

      {import.meta.env.VITE_DEMO_MODE === 'true' && (
        <>
          {/* ── Divider ── */}
          <div className="flex items-center gap-3 my-5">
            <span className="flex-1 h-px bg-outline-variant/40" />
            <span className="text-[11px] text-on-surface-variant/40 font-medium tracking-wider uppercase">Info Demo</span>
            <span className="flex-1 h-px bg-outline-variant/40" />
          </div>

          <DemoHint />
        </>
      )}

      {/* ── Register link ── */}
      <p className="mt-6 text-center text-sm text-on-surface-variant/50">
        Belum punya akun?{' '}
        <Link to={ROUTES.AUTH.REGISTER} className="text-primary font-semibold hover:text-primary-dark transition-colors">
          Daftar sekarang
        </Link>
      </p>
    </>
  )
}

export default LoginPage

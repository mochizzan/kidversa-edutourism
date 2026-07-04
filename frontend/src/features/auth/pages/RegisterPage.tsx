import { useState, useMemo, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { UserRole } from '../../../core/types'
import { cn } from '../../../core/utils'

// ── Zod Schema ──
const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Nama minimal 2 karakter')
      .max(100, 'Nama maksimal 100 karakter'),
    email: z.string().email('Format email tidak valid'),
    password: z
      .string()
      .min(8, 'Password minimal 8 karakter')
      .regex(/[A-Z]/, 'Harus ada huruf besar')
      .regex(/[a-z]/, 'Harus ada huruf kecil')
      .regex(/[0-9]/, 'Harus ada angka'),
    confirmPassword: z.string(),
    role: z.nativeEnum(UserRole, { message: 'Pilih peran yang valid' }),
    terms: z.literal(true, { message: 'Wajib menyetujui syarat & ketentuan' }),
    honeypot: z.string().max(0).optional().or(z.literal('')),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Password tidak cocok',
    path: ['confirmPassword'],
  })

type RegisterFormData = z.infer<typeof registerSchema>

// ── Steps ──
const STEPS = [
  { label: 'Nama', desc: 'Masukkan nama lengkap Anda' },
  { label: 'Email', desc: 'Email yang aktif digunakan' },
  { label: 'Password', desc: 'Minimal 8 karakter, ada huruf besar, kecil & angka' },
  { label: 'Daftar', desc: 'Lengkapi data terakhir' },
] as const

// ── Password strength ──
function getStrength(pw: string): number {
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[a-z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++
  return Math.min(s, 4)
}
const STRENGTH_LABELS = ['Sangat Lemah', 'Lemah', 'Sedang', 'Kuat', 'Sangat Kuat']
const STRENGTH_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-600']
const STRENGTH_TEXT_COLORS = ['text-red-600', 'text-orange-600', 'text-yellow-600', 'text-green-600', 'text-green-700']

/* ── Component ── */
const RegisterPage = () => {
  const [step, setStep] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const navigate = useNavigate()
  const { register: registerUser } = useAuth()

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: UserRole.FASILITATOR,
      terms: undefined as unknown as true,
      honeypot: '',
    },
  })

  const passwordValue = watch('password', '')
  const passwordStrength = useMemo(() => getStrength(passwordValue), [passwordValue])

  // ── Step validation ──
  const canAdvance = useCallback(async () => {
    switch (step) {
      case 0: return await trigger('name')
      case 1: return await trigger('email')
      case 2: {
        const pwOk = await trigger('password')
        const cpOk = await trigger('confirmPassword')
        return pwOk && cpOk
      }
      default: return true
    }
  }, [step, trigger])

  const handleNext = async () => {
    if (await canAdvance()) setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const handleBack = () => setStep((s) => Math.max(s - 1, 0))

  // ── Submit ──
  const onSubmit = async (data: RegisterFormData) => {
    setGeneralError(null)
    if (data.honeypot?.length) return
    try {
      await registerUser({
        tenant_id: 't-1',
        email: data.email,
        password: data.password,
        role: data.role,
        name: data.name,
      })
      setIsSuccess(true)
      setTimeout(() => navigate('/auth/login', { replace: true, state: { message: 'Registrasi berhasil! Silakan masuk.' } }), 1500)
    } catch (err) {
      if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
        setGeneralError('Email sudah terdaftar')
      } else {
        setGeneralError('Terjadi kesalahan. Silakan coba lagi.')
      }
    }
  }

  // ── Success ──
  if (isSuccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-8 animate-fade-in-up">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-on-surface mb-1">Registrasi Berhasil!</h2>
        <p className="text-sm text-on-surface-variant/60 text-center">
          Anda akan diarahkan ke halaman login…
        </p>
      </div>
    )
  }

  // ── Render ──
  return (
    <>
      {/* ── Header ── */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-lg shadow-primary/25 flex items-center justify-center mb-3">
          <img
            src="/logo.png"
            alt="Kidversa"
            className="w-8 h-8 object-contain"
          />
        </div>
        <h2 className="text-xl font-bold text-on-surface tracking-tight text-center">
          Buat Akun Baru
        </h2>
        <p className="text-sm text-on-surface-variant/60 mt-1.5 text-center max-w-[240px] leading-relaxed">
          {STEPS[step].desc}
        </p>
      </div>

      {/* ── Error ── */}
      {generalError && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 bg-error-container rounded-xl text-on-error-container text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{generalError}</span>
        </div>
      )}

      {/* ── Timeline indicator ── */}
      <div className="mb-7">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              {/* Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0',
                    i < step && 'bg-primary text-on-primary shadow-sm',
                    i === step && 'bg-primary text-on-primary shadow-lg shadow-primary/30 animate-[stepPulse_2s_ease-in-out_infinite]',
                    i > step && 'bg-surface-container-high text-on-surface-variant/30 border border-outline-variant/30',
                  )}
                >
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    'text-[10px] mt-1.5 font-medium whitespace-nowrap transition-colors',
                    i <= step ? 'text-primary' : 'text-on-surface-variant/30',
                  )}
                >
                  {s.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 rounded-full relative overflow-hidden bg-surface-container-high mb-5">
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500 ease-out',
                      i < step ? 'w-full' : 'w-0',
                    )}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Step content ── */}
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Honeypot */}
        <div aria-hidden="true" className="absolute -left-[9999px] opacity-0 h-0 w-0 overflow-hidden pointer-events-none">
          <label htmlFor="register-website">Website</label>
          <input id="register-website" type="text" tabIndex={-1} autoComplete="off" {...register('honeypot')} />
        </div>

        {/* Step content with mount animation */}
        <div key={step} className="animate-fade-in-up-sm space-y-4">
          {/* ── Step 0: Nama ── */}
          {step === 0 && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
                Nama Lengkap
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40 pointer-events-none" />
                <input
                  type="text"
                  {...register('name')}
                  className={cn(
                    'w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200',
                    'bg-surface-container-low placeholder:text-on-surface-variant/35',
                    'focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15',
                    errors.name ? 'border-error' : 'border-outline-variant/60',
                  )}
                  placeholder="Nama Lengkap"
                  disabled={isSubmitting}
                />
              </div>
              {errors.name && <p className="mt-1 text-xs text-error font-medium">{errors.name.message}</p>}
            </div>
          )}

          {/* ── Step 1: Email ── */}
          {step === 1 && (
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
                    'bg-surface-container-low placeholder:text-on-surface-variant/35',
                    'focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15',
                    errors.email ? 'border-error' : 'border-outline-variant/60',
                  )}
                  placeholder="email@example.com"
                  disabled={isSubmitting}
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-error font-medium">{errors.email.message}</p>}
            </div>
          )}

          {/* ── Step 2: Password + Confirm ── */}
          {step === 2 && (
            <>
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
                      'bg-surface-container-low placeholder:text-on-surface-variant/35',
                      'focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15',
                      errors.password ? 'border-error' : 'border-outline-variant/60',
                    )}
                    placeholder="Minimal 8 karakter"
                    disabled={isSubmitting}
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
                {errors.password && <p className="mt-1 text-xs text-error font-medium">{errors.password.message}</p>}

                {/* Strength bar */}
                {passwordValue && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((lvl) => (
                        <div
                          key={lvl}
                          className={cn(
                            'h-1.5 flex-1 rounded-full transition-colors duration-300',
                            passwordStrength >= lvl ? STRENGTH_COLORS[passwordStrength] : 'bg-surface-container-high',
                          )}
                        />
                      ))}
                    </div>
                    <p className={cn('text-[11px] mt-1 font-medium', STRENGTH_TEXT_COLORS[passwordStrength])}>
                      Kekuatan: {STRENGTH_LABELS[passwordStrength]}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
                  Konfirmasi Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40 pointer-events-none" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    {...register('confirmPassword')}
                    className={cn(
                      'w-full pl-10 pr-11 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200',
                      'bg-surface-container-low placeholder:text-on-surface-variant/35',
                      'focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15',
                      errors.confirmPassword ? 'border-error' : 'border-outline-variant/60',
                    )}
                    placeholder="Ulangi password"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-xs text-error font-medium">{errors.confirmPassword.message}</p>
                )}
              </div>
            </>
          )}

          {/* ── Step 3: Role + Terms + Submit ── */}
          {step === 3 && (
            <>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
                  Peran
                </label>
                <select
                  {...register('role')}
                  className={cn(
                    'w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200 appearance-none',
                    'bg-surface-container-low',
                    'focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15',
                    errors.role ? 'border-error' : 'border-outline-variant/60',
                  )}
                  disabled={isSubmitting}
                >
                  <option value={UserRole.FASILITATOR}>Fasilitator</option>
                  <option value={UserRole.KOORDINATOR}>Koordinator</option>
                  <option value={UserRole.ADMIN_WISATA}>Admin Wisata</option>
                </select>
                {errors.role && <p className="mt-1 text-xs text-error font-medium">{errors.role.message}</p>}
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  {...register('terms')}
                  className={cn(
                    'w-4 h-4 mt-0.5 rounded shrink-0 accent-primary',
                    errors.terms ? 'border-error' : '',
                  )}
                  disabled={isSubmitting}
                />
                <span className="text-sm text-on-surface-variant/60 leading-relaxed">
                  Saya setuju dengan{' '}
                  <Link to="/terms" className="text-primary font-semibold hover:text-primary-dark transition-colors">
                    Syarat & Ketentuan
                  </Link>{' '}
                  dan{' '}
                  <Link to="/privacy" className="text-primary font-semibold hover:text-primary-dark transition-colors">
                    Kebijakan Privasi
                  </Link>
                </span>
              </div>
              {errors.terms && <p className="text-xs text-error font-medium">{errors.terms.message}</p>}

              {/* Submit */}
              {step === STEPS.length - 1 && (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn(
                    'w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 mt-2',
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
                    'Daftar'
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Navigation buttons ── */}
        <div className="flex items-center gap-3 mt-6">
          {step > 0 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={isSubmitting}
              className={cn(
                'flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
                'text-on-surface-variant bg-surface-container-high hover:bg-surface-container-higher active:scale-[0.98]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              Kembali
            </button>
          )}

          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              className={cn(
                'flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ml-auto',
                'bg-primary text-on-primary',
                'hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5',
                'active:scale-[0.98] active:translate-y-0',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              Lanjut
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* ── Login link ── */}
      <p className="mt-6 text-center text-sm text-on-surface-variant/50">
        Sudah punya akun?{' '}
        <Link
          to="/auth/login"
          className="text-primary font-semibold hover:text-primary-dark transition-colors"
        >
          Masuk
        </Link>
      </p>
    </>
  )
}

export default RegisterPage

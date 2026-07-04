import { useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronRight, ChevronLeft, AlertCircle, Check } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { UserRole } from '../../../core/types'
import { cn } from '../../../core/utils'
import { WizardTimeline } from '../components/WizardTimeline'
import { RegisterStepName } from '../components/RegisterStepName'
import { RegisterStepEmail } from '../components/RegisterStepEmail'
import { RegisterStepPassword } from '../components/RegisterStepPassword'
import { RegisterStepTerms } from '../components/RegisterStepTerms'

// ── Zod Schema ──
const registerSchema = z
  .object({
    name: z.string().min(2, 'Nama minimal 2 karakter').max(100, 'Nama maksimal 100 karakter'),
    email: z.string().email('Format email tidak valid'),
    password: z.string().min(8, 'Password minimal 8 karakter').regex(/[A-Z]/, 'Harus ada huruf besar').regex(/[a-z]/, 'Harus ada huruf kecil').regex(/[0-9]/, 'Harus ada angka'),
    confirmPassword: z.string(),
    role: z.nativeEnum(UserRole, { message: 'Pilih peran yang valid' }),
    terms: z.literal(true, { message: 'Wajib menyetujui syarat & ketentuan' }),
    honeypot: z.string().max(0).optional().or(z.literal('')),
  })
  .refine((d) => d.password === d.confirmPassword, { message: 'Password tidak cocok', path: ['confirmPassword'] })

type RegisterFormData = z.infer<typeof registerSchema>

// ── Steps ──
const STEPS = [
  { label: 'Nama', desc: 'Masukkan nama lengkap Anda' },
  { label: 'Email', desc: 'Email yang aktif digunakan' },
  { label: 'Password', desc: 'Minimal 8 karakter, ada huruf besar, kecil & angka' },
  { label: 'Daftar', desc: 'Lengkapi data terakhir' },
] as const

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
      name: '', email: '', password: '', confirmPassword: '',
      role: UserRole.FASILITATOR, terms: undefined as unknown as true, honeypot: '',
    },
  })

  const passwordValue = watch('password', '')

  // ── Step validation ──
  const canAdvance = useCallback(async () => {
    switch (step) {
      case 0: return await trigger('name')
      case 1: return await trigger('email')
      case 2: { const pwOk = await trigger('password'); const cpOk = await trigger('confirmPassword'); return pwOk && cpOk }
      default: return true
    }
  }, [step, trigger])

  const handleNext = async () => { if (await canAdvance()) setStep((s) => Math.min(s + 1, STEPS.length - 1)) }
  const handleBack = () => setStep((s) => Math.max(s - 1, 0))

  // ── Submit ──
  const onSubmit = async (data: RegisterFormData) => {
    setGeneralError(null)
    if (data.honeypot?.length) return
    try {
      await registerUser({ tenant_id: 't-1', email: data.email, password: data.password, role: data.role, name: data.name })
      setIsSuccess(true)
      setTimeout(() => navigate('/auth/login', { replace: true, state: { message: 'Registrasi berhasil! Silakan masuk.' } }), 1500)
    } catch (err) {
      setGeneralError(err instanceof Error && err.message === 'EMAIL_EXISTS' ? 'Email sudah terdaftar' : 'Terjadi kesalahan. Silakan coba lagi.')
    }
  }

  // ── Success screen ──
  if (isSuccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-8 animate-fade-in-up">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-on-surface mb-1">Registrasi Berhasil!</h2>
        <p className="text-sm text-on-surface-variant/60 text-center">Anda akan diarahkan ke halaman login…</p>
      </div>
    )
  }

  return (
    <>
      {/* ── Header ── */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-lg shadow-primary/25 flex items-center justify-center mb-3">
          <img src="/logo.png" alt="Kidversa" className="w-8 h-8 object-contain" />
        </div>
        <h2 className="text-xl font-bold text-on-surface tracking-tight text-center">Buat Akun Baru</h2>
        <p className="text-sm text-on-surface-variant/60 mt-1.5 text-center max-w-[240px] leading-relaxed">{STEPS[step].desc}</p>
      </div>

      {/* ── Error ── */}
      {generalError && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 bg-error-container rounded-xl text-on-error-container text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{generalError}</span>
        </div>
      )}

      <WizardTimeline steps={STEPS} currentStep={step} />

      {/* ── Step content ── */}
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Honeypot */}
        <div aria-hidden="true" className="absolute -left-[9999px] opacity-0 h-0 w-0 overflow-hidden pointer-events-none">
          <label htmlFor="register-website">Website</label>
          <input id="register-website" type="text" tabIndex={-1} autoComplete="off" {...register('honeypot')} />
        </div>

        <div key={step} className="animate-fade-in-up-sm space-y-4">
          {step === 0 && <RegisterStepName register={register} errors={errors} disabled={isSubmitting} />}
          {step === 1 && <RegisterStepEmail register={register} errors={errors} disabled={isSubmitting} />}
          {step === 2 && (
            <RegisterStepPassword
              register={register}
              errors={errors}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              showConfirm={showConfirm}
              setShowConfirm={setShowConfirm}
              passwordValue={passwordValue}
              disabled={isSubmitting}
            />
          )}
          {step === 3 && <RegisterStepTerms register={register} errors={errors} isSubmitting={isSubmitting} />}
        </div>

        {/* ── Submit button (only on last step) ── */}
        {step === STEPS.length - 1 && (
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 mt-4',
              'bg-gradient-to-r from-primary to-primary-dark text-on-primary',
              'hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5',
              'active:scale-[0.98] active:translate-y-0',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0 disabled:hover:scale-100',
              'flex items-center justify-center gap-2',
            )}
          >
            {isSubmitting ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-2 border-on-primary border-t-transparent" /><span>Memproses…</span></>
            ) : 'Daftar'}
          </button>
        )}

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
              <ChevronLeft className="w-4 h-4" /> Kembali
            </button>
          )}
          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              className={cn(
                'flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ml-auto',
                'bg-primary text-on-primary hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5',
                'active:scale-[0.98] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              Lanjut <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* ── Login link ── */}
      <p className="mt-6 text-center text-sm text-on-surface-variant/50">
        Sudah punya akun?{' '}
        <Link to="/auth/login" className="text-primary font-semibold hover:text-primary-dark transition-colors">Masuk</Link>
      </p>
    </>
  )
}

export default RegisterPage

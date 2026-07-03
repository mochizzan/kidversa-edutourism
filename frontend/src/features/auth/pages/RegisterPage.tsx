import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { UserRole } from '../../../core/types'

// Zod schema
const registerSchema = z.object({
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
  role: z.nativeEnum(UserRole, {
    message: 'Pilih peran yang valid',
  }),
  terms: z.literal(true, {
    message: 'Wajib menyetujui syarat & ketentuan',
  }),
  honeypot: z.string().max(0, 'Robot terdeteksi').optional().or(z.literal('')),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Password tidak cocok',
  path: ['confirmPassword'],
})

type RegisterFormData = z.infer<typeof registerSchema>

// Password strength calculator
function getPasswordStrength(password: string): number {
  let strength = 0
  if (password.length >= 8) strength++
  if (/[A-Z]/.test(password)) strength++
  if (/[a-z]/.test(password)) strength++
  if (/[0-9]/.test(password)) strength++
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) strength++
  return Math.min(strength, 4)
}

const strengthLabels = ['Sangat Lemah', 'Lemah', 'Sedang', 'Kuat', 'Sangat Kuat']
const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-600']

const RegisterPage = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const navigate = useNavigate()
  const { register: registerUser } = useAuth()

  const {
    register,
    handleSubmit,
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
  const passwordStrength = useMemo(() => getPasswordStrength(passwordValue), [passwordValue])

  const onSubmit = async (data: RegisterFormData) => {
    setGeneralError(null)

    // Honeypot check
    if (data.honeypot && data.honeypot.length > 0) {
      return
    }

    try {
      await registerUser({
        tenant_id: 't-1',
        email: data.email,
        password: data.password,
        role: data.role,
        name: data.name,
      })
      setIsSuccess(true)
      // Redirect to login after short delay
      setTimeout(() => {
        navigate('/auth/login', {
          replace: true,
          state: { message: 'Registrasi berhasil! Silakan masuk.' },
        })
      }, 1500)
    } catch (err) {
      if (err instanceof Error) {
        switch (err.message) {
          case 'EMAIL_EXISTS':
            setGeneralError('Email sudah terdaftar')
            break
          default:
            setGeneralError('Terjadi kesalahan. Silakan coba lagi')
        }
      } else {
        setGeneralError('Terjadi kesalahan. Silakan coba lagi')
      }
    }
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Registrasi Berhasil!</h2>
        <p className="text-gray-600">Anda akan diarahkan ke halaman login...</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        Buat Akun Baru
      </h2>

      {/* General Error Alert */}
      {generalError && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{generalError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Honeypot field */}
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
          <label htmlFor="register-website">Website</label>
          <input
            id="register-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...register('honeypot')}
          />
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nama Lengkap
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              {...register('name')}
              className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Nama Lengkap"
              disabled={isSubmitting}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'register-name-error' : undefined}
            />
          </div>
          {errors.name && (
            <p id="register-name-error" className="mt-1 text-sm text-red-600">
              {errors.name.message}
            </p>
          )}
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
              disabled={isSubmitting}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'register-email-error' : undefined}
            />
          </div>
          {errors.email && (
            <p id="register-email-error" className="mt-1 text-sm text-red-600">
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
              placeholder="Minimal 8 karakter"
              disabled={isSubmitting}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'register-password-error' : 'register-password-strength'}
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
            <p id="register-password-error" className="mt-1 text-sm text-red-600">
              {errors.password.message}
            </p>
          )}
          {/* Password Strength Indicator */}
          {passwordValue && (
            <div id="register-password-strength" className="mt-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      passwordStrength >= level ? strengthColors[passwordStrength] : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              <p className={`text-xs mt-1 ${
                passwordStrength <= 1 ? 'text-red-600' :
                passwordStrength <= 2 ? 'text-orange-600' :
                passwordStrength <= 3 ? 'text-yellow-600' :
                'text-green-600'
              }`}>
                Kekuatan: {strengthLabels[passwordStrength]}
              </p>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Konfirmasi Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              {...register('confirmPassword')}
              className={`w-full pl-10 pr-12 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${
                errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Masukkan ulang password"
              disabled={isSubmitting}
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? 'register-confirm-error' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p id="register-confirm-error" className="mt-1 text-sm text-red-600">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {/* Role */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Peran
          </label>
          <select
            {...register('role')}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${
              errors.role ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={isSubmitting}
            aria-invalid={!!errors.role}
            aria-describedby={errors.role ? 'register-role-error' : undefined}
          >
            <option value={UserRole.FASILITATOR}>Fasilitator</option>
            <option value={UserRole.KOORDINATOR}>Koordinator</option>
            <option value={UserRole.ADMIN_WISATA}>Admin Wisata</option>
          </select>
          {errors.role && (
            <p id="register-role-error" className="mt-1 text-sm text-red-600">
              {errors.role.message}
            </p>
          )}
        </div>

        {/* Terms */}
        <div className="flex items-start">
          <input
            type="checkbox"
            {...register('terms')}
            className={`w-4 h-4 mt-1 rounded border-gray-300 text-primary focus:ring-primary ${
              errors.terms ? 'border-red-500' : ''
            }`}
            disabled={isSubmitting}
            aria-invalid={!!errors.terms}
            aria-describedby={errors.terms ? 'register-terms-error' : undefined}
          />
          <span className="ml-2 text-sm text-gray-600">
            Saya setuju dengan{' '}
            <Link to="/terms" className="text-primary hover:text-primary-dark">
              Syarat & Ketentuan
            </Link>{' '}
            dan{' '}
            <Link to="/privacy" className="text-primary hover:text-primary-dark">
              Kebijakan Privasi
            </Link>
          </span>
        </div>
        {errors.terms && (
          <p id="register-terms-error" className="text-sm text-red-600">
            {errors.terms.message}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Memproses...</span>
            </>
          ) : (
            'Daftar'
          )}
        </button>
      </form>

      {/* Login link */}
      <p className="mt-6 text-center text-sm text-gray-600">
        Sudah punya akun?{' '}
        <Link to="/auth/login" className="text-primary hover:text-primary-dark font-semibold">
          Masuk
        </Link>
      </p>
    </div>
  )
}

export default RegisterPage

import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { cn } from '../../../core/utils'

interface LoginFormFields {
  email: string
  password: string
  honeypot?: string
}

interface LoginFormProps {
  register: UseFormRegister<LoginFormFields>
  errors: FieldErrors<LoginFormFields>
  showPassword: boolean
  setShowPassword: (v: boolean) => void
  isSubmitting: boolean
  isLocked: boolean
}

export function LoginForm({ register, errors, showPassword, setShowPassword, isSubmitting, isLocked }: LoginFormProps) {
  return (
    <div className="space-y-4">
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
    </div>
  )
}

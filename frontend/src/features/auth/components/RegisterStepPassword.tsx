import { Lock, Eye, EyeOff } from 'lucide-react'
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { cn } from '../../../core/utils'
import { PasswordStrengthBar } from './PasswordStrengthBar'

interface RegisterStepPasswordProps {
  register: UseFormRegister<any>
  errors: FieldErrors
  showPassword: boolean
  setShowPassword: (v: boolean) => void
  showConfirm: boolean
  setShowConfirm: (v: boolean) => void
  passwordValue: string
  disabled?: boolean
}

export function RegisterStepPassword({
  register,
  errors,
  showPassword,
  setShowPassword,
  showConfirm,
  setShowConfirm,
  passwordValue,
  disabled,
}: RegisterStepPasswordProps) {
  return (
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
            disabled={disabled}
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
        {errors.password && <p className="mt-1 text-xs text-error font-medium">{errors.password.message as string}</p>}
        <PasswordStrengthBar password={passwordValue} />
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
            disabled={disabled}
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
          <p className="mt-1 text-xs text-error font-medium">{errors.confirmPassword.message as string}</p>
        )}
      </div>
    </>
  )
}

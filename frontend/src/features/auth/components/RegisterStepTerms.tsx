import { Link } from 'react-router-dom'
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { UserRole } from '../../../core/types'
import { cn } from '../../../core/utils'

interface RegisterStepTermsProps {
  register: UseFormRegister<any>
  errors: FieldErrors
  isSubmitting: boolean
}

export function RegisterStepTerms({ register, errors, isSubmitting }: RegisterStepTermsProps) {
  return (
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
        {errors.role && <p className="mt-1 text-xs text-error font-medium">{errors.role.message as string}</p>}
      </div>

      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          {...register('terms')}
          className={cn('w-4 h-4 mt-0.5 rounded shrink-0 accent-primary', errors.terms ? 'border-error' : '')}
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
      {errors.terms && <p className="text-xs text-error font-medium">{errors.terms.message as string}</p>}
    </>
  )
}

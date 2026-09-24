import { Link } from 'react-router-dom'
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { UserRole } from '../../../core/types'
import type { Tenant } from '../../../core/types'
import { cn } from '../../../core/utils'

interface RegisterStepTermsProps {
  register: UseFormRegister<any>
  errors: FieldErrors
  isSubmitting: boolean
  tenants?: Tenant[]
}

export function RegisterStepTerms({ register, errors, isSubmitting, tenants = [] }: RegisterStepTermsProps) {
  const { t } = useTranslation()
  return (
    <>
      <div>
        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
          {t('auth.register.branchLabel')}
        </label>
        <select
          {...register('tenant_id')}
          className={cn(
            'w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all duration-200 appearance-none',
            'bg-surface-container-low',
            'focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15',
            errors.tenant_id ? 'border-error' : 'border-outline-variant/60',
          )}
          disabled={isSubmitting}
        >
          <option value="">{t('auth.register.branchPlaceholder')}</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
          ))}
        </select>
        {errors.tenant_id && <p className="mt-1 text-xs text-error font-medium">{errors.tenant_id.message as string}</p>}
      </div>

      <div>
        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 tracking-wide">
          {t('auth.register.roleLabel')}
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
          <option value={UserRole.ADMIN}>Admin</option>
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
          {t('auth.register.termsPrefix')}{' '}
          <Link to="/terms" className="text-primary font-semibold hover:text-primary-dark transition-colors">
            {t('auth.register.termsLink')}
          </Link>{' '}
          {t('auth.register.termsAnd')}{' '}
          <Link to="/privacy" className="text-primary font-semibold hover:text-primary-dark transition-colors">
            {t('auth.register.privacyLink')}
          </Link>
        </span>
      </div>
      {errors.terms && <p className="text-xs text-error font-medium">{errors.terms.message as string}</p>}
    </>
  )
}

import { User } from 'lucide-react'
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { cn } from '../../../core/utils'

interface RegisterStepNameProps {
  register: UseFormRegister<any>
  errors: FieldErrors
  disabled?: boolean
}

export function RegisterStepName({ register, errors, disabled }: RegisterStepNameProps) {
  return (
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
          disabled={disabled}
        />
      </div>
      {errors.name && <p className="mt-1 text-xs text-error font-medium">{errors.name.message as string}</p>}
    </div>
  )
}

import { type SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../../core/utils'

interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  options: SelectOption[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')
    const errorId = `${selectId}-error`
    const hintId = `${selectId}-hint`
    const describedBy = error ? errorId : hint ? hintId : undefined

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-on-surface mb-1">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm',
            'focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant',
            error && 'border-error focus:border-error focus:ring-error-container',
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <p id={errorId} className="mt-1 text-sm text-error">{error}</p>}
        {hint && !error && <p id={hintId} className="mt-1 text-sm text-on-surface-variant">{hint}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'

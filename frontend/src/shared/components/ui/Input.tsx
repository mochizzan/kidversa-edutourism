import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../../core/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    const errorId = `${inputId}-error`
    const hintId = `${inputId}-hint`
    const describedBy = error ? errorId : hint ? hintId : undefined

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-on-surface mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm',
              'placeholder:text-on-surface-variant',
              'focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none',
              'disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant',
              error && 'border-error focus:border-error focus:ring-error-container',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p id={errorId} className="mt-1 text-sm text-error">{error}</p>}
        {hint && !error && <p id={hintId} className="mt-1 text-sm text-on-surface-variant">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

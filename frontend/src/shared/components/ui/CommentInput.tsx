import { useRef, useEffect, type ChangeEvent } from 'react'
import { cn } from '../../../core/utils'

interface CommentInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  maxLength?: number
  placeholder?: string
  className?: string
}

export function CommentInput({
  value,
  onChange,
  disabled = false,
  maxLength = 300,
  placeholder = 'Tulis komentar...',
  className,
}: CommentInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const remaining = maxLength - value.length
  const isOverLimit = remaining < 0

  const autoGrow = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }

  useEffect(() => {
    autoGrow()
  }, [value])

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className={cn('w-full', className)}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        rows={3}
        className={cn(
          'w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm resize-none overflow-hidden',
          'placeholder:text-on-surface-variant',
          'focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none',
          'disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant',
          isOverLimit && 'border-error focus:border-error focus:ring-error-container'
        )}
        aria-label="Komentar"
      />
      <div className="flex justify-end mt-1">
        <span
          className={cn(
            'text-xs transition-colors',
            isOverLimit
              ? 'text-error font-medium'
              : 'text-on-surface-variant'
          )}
        >
          {remaining}
        </span>
        <span className="text-xs text-on-surface-variant">
          /{maxLength}
        </span>
      </div>
    </div>
  )
}

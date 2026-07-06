import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '../../../core/utils'

interface StarRatingInputProps {
  value: number
  onChange?: (value: number) => void
  disabled?: boolean
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
}

const tapTargetMap = {
  sm: 'min-w-[44px] min-h-[44px]',
  md: 'min-w-[44px] min-h-[44px]',
  lg: 'min-w-[52px] min-h-[52px]',
}

export function StarRatingInput({
  value,
  onChange,
  disabled = false,
  readonly = false,
  size = 'md',
  className,
}: StarRatingInputProps) {
  const [hovered, setHovered] = useState(0)
  const isInteractive = !disabled && !readonly
  const displayValue = hovered || value

  const handleClick = (star: number) => {
    if (!isInteractive) return
    onChange?.(star)
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5',
        disabled && 'opacity-50',
        className
      )}
      role="radiogroup"
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= displayValue
        return (
          <button
            key={star}
            type="button"
            disabled={!isInteractive}
            onClick={() => handleClick(star)}
            onMouseEnter={() => {
              if (isInteractive) setHovered(star)
            }}
            onMouseLeave={() => {
              if (isInteractive) setHovered(0)
            }}
            className={cn(
              tapTargetMap[size],
              'flex items-center justify-center p-1 rounded-lg transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
              isInteractive
                ? 'cursor-pointer hover:bg-primary-container/30'
                : 'cursor-default'
            )}
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} dari 5 bintang`}
          >
            <Star
              className={cn(
                sizeMap[size],
                'transition-all duration-150',
                isFilled
                  ? 'text-amber-400 fill-amber-400'
                  : 'text-gray-300 fill-transparent'
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

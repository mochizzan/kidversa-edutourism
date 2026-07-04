import { cn } from '../../../core/utils'

interface PasswordStrengthBarProps {
  password: string
}

const STRENGTH_LABELS = ['Sangat Lemah', 'Lemah', 'Sedang', 'Kuat', 'Sangat Kuat']
const STRENGTH_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-600']
const STRENGTH_TEXT_COLORS = ['text-red-600', 'text-orange-600', 'text-yellow-600', 'text-green-600', 'text-green-700']

function getStrength(pw: string): number {
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[a-z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++
  return Math.min(s, 4)
}

export function PasswordStrengthBar({ password }: PasswordStrengthBarProps) {
  if (!password) return null
  const strength = getStrength(password)

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((lvl) => (
          <div
            key={lvl}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-300',
              strength >= lvl ? STRENGTH_COLORS[strength] : 'bg-surface-container-high',
            )}
          />
        ))}
      </div>
      <p className={cn('text-[11px] mt-1 font-medium', STRENGTH_TEXT_COLORS[strength])}>
        Kekuatan: {STRENGTH_LABELS[strength]}
      </p>
    </div>
  )
}

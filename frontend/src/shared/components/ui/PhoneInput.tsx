import { cn } from '../../../core/utils'
import { combinePhone, detectCountry, getCountryOptions } from '../../../core/utils/phone'

export type PhoneInputProps = {
  id?: string
  label?: string
  /** E.164; '' = kosong; nilai legacy non-E.164 ditampilkan sebagai input nasional. */
  value: string
  /** Selalu memancarkan E.164 (atau ''). */
  onChange: (value: string) => void
  error?: string
  hint?: string
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
  placeholder?: string
}

export function PhoneInput({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  disabled,
  autoFocus,
  placeholder,
}: PhoneInputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const describedBy = error ? errorId : hint ? hintId : undefined

  const { iso, dialCode, national } = detectCountry(value)
  const countries = getCountryOptions()

  const handleInput = (raw: string) => {
    if (raw.includes('+')) {
      // Tempelan (paste) internasional → deteksi ulang negara dari digit mentah.
      const digits = raw.replace(/\D/g, '')
      const detected = detectCountry(`+${digits}`)
      onChange(combinePhone(detected.national, detected.dialCode))
      return
    }
    // combinePhone membuang SATU leading 0 (input lokal "0812…" → "812…").
    onChange(combinePhone(raw, dialCode))
  }

  const handleCountryChange = (nextIso: string) => {
    const next = countries.find((c) => c.iso === nextIso)
    if (!next) return
    onChange(combinePhone(national, next.dialCode))
  }

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-on-surface mb-1">
          {label}
          {required && ' *'}
        </label>
      )}
      <div className="flex">
        <select
          aria-label="Kode negara"
          value={iso}
          onChange={(e) => handleCountryChange(e.target.value)}
          disabled={disabled}
          className={cn(
            'rounded-l-xl border border-r-0 border-outline-variant bg-surface px-2 py-2 text-sm',
            'focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant',
            error && 'border-error focus:border-error focus:ring-error-container'
          )}
        >
          {countries.map((c) => (
            <option key={c.iso} value={c.iso}>
              {`${c.flag} +${c.dialCode} — ${c.name}`}
            </option>
          ))}
        </select>
        <div
          className={cn(
            'flex flex-1 items-center rounded-r-xl border border-outline-variant bg-surface',
            'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-container',
            'disabled:cursor-not-allowed disabled:bg-surface-container-low',
            error && 'border-error focus-within:border-error focus-within:ring-error-container'
          )}
        >
          <span className="border-r border-outline-variant px-3 py-2 text-sm text-on-surface-variant">
            +{dialCode}
          </span>
          <input
            id={inputId}
            inputMode="numeric"
            autoComplete="tel"
            placeholder={placeholder}
            value={national}
            onChange={(e) => handleInput(e.target.value)}
            disabled={disabled}
            autoFocus={autoFocus}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'w-full bg-transparent px-3 py-2 text-sm',
              'placeholder:text-on-surface-variant focus:outline-none',
              'disabled:cursor-not-allowed disabled:text-on-surface-variant'
            )}
          />
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-error">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-sm text-on-surface-variant">
          {hint}
        </p>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Search } from 'lucide-react'
import { cn } from '../../../core/utils'
import { combinePhone, detectCountry, getCountryOptions } from '../../../core/utils/phone'
import { FlagIcon, loadFlagRegistry } from './FlagIcon'

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
  const { t } = useTranslation()
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const describedBy = error ? errorId : hint ? hintId : undefined

  const { iso, dialCode, national } = detectCountry(value)
  const countries = getCountryOptions()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [flagsReady, setFlagsReady] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const q = query.trim().toLowerCase()
  const list = countries.filter((c) => !q || c.name.toLowerCase().includes(q) || c.dialCode.includes(q))
  const activeCountry = list[activeIndex]
  const activeId = open && activeCountry ? `${inputId}-country-${activeCountry.iso}` : undefined

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

  const openPanel = () => {
    setQuery('')
    setActiveIndex(Math.max(0, countries.findIndex((c) => c.iso === iso)))
    setOpen(true)
  }

  const chooseCountry = (nextIso: string) => {
    handleCountryChange(nextIso)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleWrapperKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (list.length > 0) setActiveIndex((i) => (i + 1) % list.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (list.length > 0) setActiveIndex((i) => (i - 1 + list.length) % list.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const active = list[activeIndex]
      if (active) chooseCountry(active.iso)
    }
  }

  // focusout: fokus keluar dari wrapper (Tab / klik elemen luar yang fokusable) → tutup.
  const handleWrapperBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
  }

  // Klik di luar wrapper → tutup panel.
  useEffect(() => {
    if (!open) return
    const handleMouseDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  // Lazy load registry bendera saat panel dibuka; gagal → teks-only, coba lagi pada open berikutnya.
  useEffect(() => {
    if (open && !flagsReady) {
      loadFlagRegistry()
        .then(() => setFlagsReady(true))
        .catch(() => { })
    }
  }, [open, flagsReady])

  // Op aktif tetap terlihat saat discroll.
  useEffect(() => {
    if (!open || !activeId) return
    document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeId])

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-on-surface mb-1">
          {label}
          {required && ' *'}
        </label>
      )}
      <div className="flex">
        <div ref={wrapperRef} className="relative" onKeyDown={handleWrapperKeyDown} onBlur={handleWrapperBlur}>
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={t('common.phone.countryCode')}
            disabled={disabled}
            onClick={() => (open ? setOpen(false) : openPanel())}
            className={cn(
              'flex w-auto items-center gap-1.5 rounded-l-xl border border-r-0 border-outline-variant bg-surface px-2 py-2 text-sm',
              'focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none',
              'disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant',
              error && 'border-error focus:border-error focus:ring-error-container'
            )}
          >
            <FlagIcon iso={iso} className="h-4 w-6 shrink-0" />
            <span>{`+${dialCode}`}</span>
          </button>
          {open && (
            <div
              className="absolute left-0 top-full z-30 mt-1 w-72 max-h-[280px] overflow-y-auto rounded-b-xl border border-outline-variant bg-surface-container-low shadow-lg"
              role="listbox"
              aria-label={t('common.phone.countryCode')}
              aria-activedescendant={activeId}
            >
              <div className="relative m-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActiveIndex(0)
                  }}
                  placeholder={t('common.phone.countryCode')}
                  aria-label={t('common.phone.countryCode')}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant text-sm text-on-surface placeholder:text-on-surface-variant"
                />
              </div>
              <div className="flex flex-col gap-1 px-2 pb-2">
                {list.map((c, index) => (
                  <div
                    key={c.iso}
                    role="option"
                    id={`${inputId}-country-${c.iso}`}
                    aria-selected={c.iso === iso}
                    data-iso={c.iso}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => chooseCountry(c.iso)}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left cursor-pointer transition-colors',
                      index === activeIndex
                        ? 'bg-primary-container text-on-primary-container'
                        : 'text-on-surface hover:bg-surface-container'
                    )}
                  >
                    <FlagIcon iso={c.iso} className="h-4 w-6 shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{c.name}</span>
                    <span className="text-sm text-on-surface-variant">+{c.dialCode}</span>
                    {c.iso === iso && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                  </div>
                ))}
                {list.length === 0 && (
                  <div className="px-3 py-4 text-sm text-on-surface-variant">{t('common.phone.emptyCountry')}</div>
                )}
              </div>
            </div>
          )}
        </div>
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center rounded-r-xl border border-outline-variant bg-surface',
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

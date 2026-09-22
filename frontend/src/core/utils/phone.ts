import { getCountries, getCountryCallingCode } from 'libphonenumber-js'

// phone.ts — Indonesian phone-number normalization to E.164 (+62...).
// Strips leading 0 / 62 / +62 and re-prepends +62. Invalid/empty input is
// returned untouched (or undefined) so the backend can surface a validation error.

export function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined
  const trimmed = phone.trim()
  if (!trimmed) return undefined
  const digits = trimmed.replace(/[^\d]/g, '')
  if (digits.length === 0) return undefined
  let national: string
  if (digits.startsWith('62')) {
    national = digits.slice(2)
  } else if (digits.startsWith('0')) {
    national = digits.slice(1)
  } else {
    national = digits
  }
  // Indonesian mobile numbers are 9-13 digits after the country code.
  if (national.length < 7 || national.length > 13) return trimmed
  return `+62${national}`
}

// --- Country picker helpers untuk PhoneInput (additive; normalizePhone di atas tidak diubah) ---

export type CountryOption = { iso: string; dialCode: string; name: string; flag: string }

let cachedCountryOptions: CountryOption[] | null = null

export function getCountryOptions(): CountryOption[] {
  if (cachedCountryOptions) return cachedCountryOptions
  const display = new Intl.DisplayNames(['id'], { type: 'region' })
  const collator = new Intl.Collator('id', { sensitivity: 'base' })
  const options: CountryOption[] = getCountries().map((iso) => ({
    iso,
    dialCode: String(getCountryCallingCode(iso)),
    name: display.of(iso) ?? iso,
    flag: String.fromCodePoint(
      ...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
    ),
  }))
  options.sort((a, b) => collator.compare(a.name, b.name))
  cachedCountryOptions = options
  return options
}

// Dial code bersama tidak bisa membedakan mitra ISO (+1 dipakai banyak negara)
// → select memakai pemetaan kanonik berikut (tampilan saja; angka tetap benar).
const PREFERRED_DIAL_ISO: Record<string, string> = {
  '1': 'US',
  '7': 'RU',
  '44': 'GB',
  '47': 'NO',
  '61': 'AU',
  '290': 'SH',
  '358': 'FI',
  '590': 'GP',
  '599': 'CW',
}

type DialEntry = { dialCode: string; iso: string }
let dialEntries: DialEntry[] | null = null

function getDialEntries(): DialEntry[] {
  if (dialEntries) return dialEntries
  const byDial = new Map<string, string>()
  for (const iso of getCountries()) {
    const dial = String(getCountryCallingCode(iso))
    if (!byDial.has(dial)) byDial.set(dial, PREFERRED_DIAL_ISO[dial] ?? iso)
  }
  // Kecocokan dial code TERPANJANG dulu (mis. +880 sebelum +88).
  dialEntries = [...byDial.entries()]
    .map(([dialCode, iso]) => ({ dialCode, iso }))
    .sort((a, b) => b.dialCode.length - a.dialCode.length)
  return dialEntries
}

export function detectCountry(value: string): { iso: string; dialCode: string; national: string } {
  if (!value.startsWith('+')) {
    // Data legacy lokal → default Indonesia, satu '0' di depan dibuang.
    return { iso: 'ID', dialCode: '62', national: value.replace(/^0/, '') }
  }
  const digits = value.slice(1)
  for (const { dialCode, iso } of getDialEntries()) {
    if (digits.startsWith(dialCode)) {
      return { iso, dialCode, national: digits.slice(dialCode.length) }
    }
  }
  return { iso: 'ID', dialCode: '62', national: digits }
}

export function combinePhone(national: string, dialCode: string): string {
  const digits = national.replace(/\D/g, '').replace(/^0/, '')
  if (!digits) return ''
  return `+${dialCode}${digits}`
}

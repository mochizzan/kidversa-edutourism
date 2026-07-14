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

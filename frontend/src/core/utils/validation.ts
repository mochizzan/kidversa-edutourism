import { z } from 'zod'
import { isValidPhoneNumber } from 'libphonenumber-js'
import { normalizePhone } from './phone'

// 1. Password rules — messages verbatim from current registerSchema.
export const zPassword = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .regex(/[A-Z]/, 'Harus ada huruf besar')
  .regex(/[a-z]/, 'Harus ada huruf kecil')
  .regex(/[0-9]/, 'Harus ada angka')

// 2. Email core — the ONLY place the email rule lives.
export function emailError(value: string | undefined, opts: { required: boolean }): string | undefined {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return opts.required ? 'Email wajib diisi' : undefined
  // Format check: one regex-free rule via zod's own email check is NOT reusable
  // standalone — use a pragmatic RFC-lite regex:
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return 'Format email tidak valid'
  return undefined
}

// 3. Zod wrappers — delegate to the plain functions; never re-implement rules.
//    Do NOT write explicit `: z.ZodType<...>` return annotations (zod v4 variance
//    friction); let TypeScript infer.
export function zEmail(opts: { required: boolean }) {
  // Output MUST be trimmed: backend `required,email` tag rejects ' budi@mail.com '.
  return z.string().trim().refine((v) => !emailError(v, opts), {
    error: (issue) => ({ message: emailError(issue.input as string, opts) ?? '' }),
  })
}

export function phoneError(value: string | undefined, opts: { required: boolean }): string | undefined {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return opts.required ? 'No. HP wajib diisi' : undefined
  const normalized = normalizePhone(trimmed)          // undefined ⇒ non-digits only
  if (!normalized) return 'Nomor telepon tidak valid'
  if (!isValidPhoneNumber(normalized)) return 'Nomor telepon tidak valid'
  return undefined
}

export function zPhone(opts: { required: boolean }) {
  return z.string().optional().refine((v) => !phoneError(v, opts), {
    error: (issue) => ({ message: phoneError(issue.input as string | undefined, opts) ?? '' }),
  })
}

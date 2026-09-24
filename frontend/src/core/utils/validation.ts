import { z } from 'zod'
import { isValidPhoneNumber } from 'libphonenumber-js'
import { normalizePhone } from './phone'
import { i18n } from '../i18n'

// 1. Password rules — messages resolved from the validation.* catalog at parse time.
export const zPassword = z
  .string()
  .min(8, { error: () => ({ message: i18n.t('validation.passwordMin') }) })
  .regex(/[A-Z]/, { error: () => ({ message: i18n.t('validation.passwordUpper') }) })
  .regex(/[a-z]/, { error: () => ({ message: i18n.t('validation.passwordLower') }) })
  .regex(/[0-9]/, { error: () => ({ message: i18n.t('validation.passwordNumber') }) })

// 2. Email core — the ONLY place the email rule lives.
export function emailError(value: string | undefined, opts: { required: boolean }): string | undefined {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return opts.required ? i18n.t('validation.emailRequired') : undefined
  // Format check: one regex-free rule via zod's own email check is NOT reusable
  // standalone — use a pragmatic RFC-lite regex:
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return i18n.t('validation.emailInvalid')
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
  if (!trimmed) return opts.required ? i18n.t('validation.phoneEmpty') : undefined
  const normalized = normalizePhone(trimmed)          // undefined ⇒ non-digits only
  if (!normalized) return i18n.t('validation.phoneInvalid')
  if (!isValidPhoneNumber(normalized)) return i18n.t('validation.phoneInvalid')
  return undefined
}

export function zPhone(opts: { required: boolean }) {
  return z.string().optional().refine((v) => !phoneError(v, opts), {
    error: (issue) => ({ message: phoneError(issue.input as string | undefined, opts) ?? '' }),
  })
}

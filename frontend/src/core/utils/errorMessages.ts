import { ApiError } from '../services/backend-client'
import { i18n, tIfExists } from '../i18n'

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    // Fallback chain: localized errors.<code> key → backend-provided message → errors.default.
    const localized = tIfExists('errors.' + err.code)
    if (localized !== undefined) return localized
    if (err.message.trim() !== '') return err.message
    return i18n.t('errors.default')
  }
  if (err instanceof Error) {
    // Network / fetch failures
    if (err.name === 'TypeError' || err.message.includes('fetch')) {
      return i18n.t('errors.network')
    }
  }
  return i18n.t('errors.default')
}

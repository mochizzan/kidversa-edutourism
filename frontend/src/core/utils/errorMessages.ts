import { ApiError } from '../services/backend-client'
import { i18n, tIfExists } from '../i18n'

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    return tIfExists('errors.' + err.code) ?? i18n.t('errors.default')
  }
  if (err instanceof Error) {
    // Network / fetch failures
    if (err.name === 'TypeError' || err.message.includes('fetch')) {
      return i18n.t('errors.network')
    }
  }
  return i18n.t('errors.default')
}

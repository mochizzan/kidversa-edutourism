import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { friendlyError } from '../../../src/core/utils/errorMessages'
import { ApiError } from '../../../src/core/services/backend-client'
import { i18n } from '../../../src/core/i18n'

function readErrors(lang: string): Record<string, string> {
  const path = resolve(process.cwd(), 'src/locales', `${lang}.json`)
  const catalog = JSON.parse(readFileSync(path, 'utf8')) as { errors: Record<string, string> }
  return catalog.errors
}

describe('friendlyError localization', () => {
  afterEach(async () => {
    await i18n.changeLanguage('id')
  })

  it('resolves ApiError codes, TypeError, and defaults against the active catalog', async () => {
    const idErrors = readErrors('id')

    // Known code → localized errors.<code> key wins over any backend message.
    expect(friendlyError(new ApiError('payload', 'forbidden', 403))).toBe(idErrors.forbidden)
    expect(friendlyError(new ApiError('backend text', 'forbidden', 403))).toBe(idErrors.forbidden)
    // Backend-produced code with a locale entry added for D-21.
    expect(friendlyError(new ApiError('backend text', 'already_generating', 409))).toBe(
      idErrors.already_generating,
    )

    // Unknown code → backend-provided message when non-empty…
    expect(friendlyError(new ApiError('pesan dari server', 'unknown_code', 400))).toBe('pesan dari server')
    // …→ errors.default when the message is empty.
    expect(friendlyError(new ApiError('', 'unknown_code', 400))).toBe(idErrors.default)

    expect(friendlyError(new TypeError('boom'))).toBe(idErrors.network)

    await i18n.changeLanguage('en')
    const enErrors = readErrors('en')
    expect(friendlyError(new ApiError('payload', 'forbidden', 403))).toBe(enErrors.forbidden)
    expect(friendlyError(new ApiError('backend text', 'forbidden', 403))).toBe(enErrors.forbidden)
    expect(friendlyError(new ApiError('backend text', 'unknown_code', 400))).toBe('backend text')
    expect(friendlyError(new ApiError('', 'unknown_code', 400))).toBe(enErrors.default)
    expect(friendlyError(new TypeError('boom'))).toBe(enErrors.network)
  })
})

import { describe, expect, it } from 'vitest'
import { buildI18n } from '../../../src/core/i18n'

describe('buildI18n language persistence', () => {
  it('resolves the language persisted in localStorage', async () => {
    localStorage.setItem('kidversa_lang', 'en')
    const { instance, ready } = buildI18n()
    await ready
    expect(instance.resolvedLanguage).toBe('en')
    localStorage.removeItem('kidversa_lang')
  })
})

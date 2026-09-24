import { describe, expect, it } from 'vitest'
import {
  LANGUAGE_CODES,
  LANGUAGES,
  RTL_LANGUAGE_CODES,
  SOURCE_LANGUAGE,
} from '../../../src/core/i18n/locales'

describe('core/i18n/locales metadata', () => {
  it('exposes exactly the 9 scope languages with unique, ordered codes', () => {
    expect(LANGUAGES.length).toBe(9)
    const codes = LANGUAGES.map((lang) => lang.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes).toEqual([...LANGUAGE_CODES])
    expect(LANGUAGE_CODES[0]).toBe('id')
  })

  it('has a non-empty flag, endonym, and english name for every language', () => {
    for (const lang of LANGUAGES) {
      expect(lang.flag.trim(), `${lang.code} flag`).not.toBe('')
      expect(lang.endonym.trim(), `${lang.code} endonym`).not.toBe('')
      expect(lang.english.trim(), `${lang.code} english`).not.toBe('')
    }
  })

  it('has no RTL language in scope and uses id as the source language', () => {
    expect([...RTL_LANGUAGE_CODES]).toEqual([])
    expect(SOURCE_LANGUAGE).toBe('id')
  })
})

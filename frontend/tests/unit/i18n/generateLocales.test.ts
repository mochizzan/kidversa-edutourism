import { describe, expect, it } from 'vitest'
import { collectParityViolations, isGlossaryTerm, splitBatches } from '../../../../tmp/generate-locales.mjs'

describe('generate-locales pure helpers', () => {
  it('splits 120 items into batches of 50', () => {
    const items = Array.from({ length: 120 }, (_, index) => index)
    expect(splitBatches(items, 50).map((batch) => batch.length)).toEqual([50, 50, 20])
  })

  it('matches glossary terms case-insensitively but not multi-word extensions', () => {
    expect(isGlossaryTerm('Koordinator')).toBe(true)
    expect(isGlossaryTerm('kOoRdInAtOr')).toBe(true)
    expect(isGlossaryTerm('Koordinator Lapangan')).toBe(false)
  })

  it('reports missing keys, empty values, and extra keys per language', () => {
    const violations = collectParityViolations(
      ['a.b', 'a.c', 'd'],
      { a: { b: 'ok' }, d: '', x: 'extra' },
      'xx',
    )
    expect(violations).toEqual(['xx a.c missing key', 'xx d empty value', 'xx x extra key'])
  })
})

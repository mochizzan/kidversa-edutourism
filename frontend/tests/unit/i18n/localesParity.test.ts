import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANGUAGE_CODES } from '../../../src/core/i18n/locales'

const LOCALES_DIR = resolve(process.cwd(), 'src/locales')

function loadCatalog(lang: string): Record<string, unknown> {
  const text = readFileSync(`${LOCALES_DIR}/${lang}.json`, 'utf8')
  return JSON.parse(text) as Record<string, unknown>
}

function flatten(value: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
    return out
  }
  if (prefix) out[prefix] = value
  return out
}

function nonStringOrEmpty(flat: Record<string, unknown>, label: string): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(flat)) {
    if (typeof value !== 'string') out.push(`${label}:${key} non-string value`)
    else if (value === '') out.push(`${label}:${key} empty value`)
  }
  return out
}

function collectViolations(
  lang: string,
  idFlat: Record<string, unknown>,
  targetFlat: Record<string, unknown>,
): string[] {
  const out: string[] = []
  for (const key of Object.keys(idFlat)) {
    if (!(key in targetFlat)) out.push(`${lang}:${key} missing key`)
  }
  for (const key of Object.keys(targetFlat)) {
    if (!(key in idFlat)) out.push(`${lang}:${key} extra key`)
  }
  out.push(...nonStringOrEmpty(targetFlat, lang))
  return out
}

describe('locale catalog parity', () => {
  it('every target catalog matches the id.json key set with non-empty values', () => {
    const idFlat = flatten(loadCatalog('id'))
    expect(nonStringOrEmpty(idFlat, 'id')).toEqual([])

    const targets = LANGUAGE_CODES.filter((code) => code !== 'id')
    expect(targets.length).toBe(8)

    const violations: string[] = []
    for (const lang of targets) {
      violations.push(...collectViolations(lang, idFlat, flatten(loadCatalog(lang))))
    }
    expect(violations).toEqual([])
  })
})

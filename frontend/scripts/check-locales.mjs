#!/usr/bin/env node
/**
 * Locale parity checker: every LANGUAGE_CODES file must exist and mirror
 * src/locales/id.json exactly — same key set, every value a non-empty string.
 *
 * Usage: node frontend/scripts/check-locales.mjs  (or `pnpm check:locales`)
 * Prints `<lang> <key> <problem>` per violation and exits 1 on any violation;
 * a clean run prints `OK <lang>` for every code and exits 0.
 */
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { collectParityViolations } from '../../tmp/generate-locales.mjs'

const LANG_DIR_URL = new URL('../src/locales/', import.meta.url)
const ID_JSON_URL = new URL('id.json', LANG_DIR_URL)
const LOCALES_TS_URL = new URL('../src/core/i18n/locales.ts', import.meta.url)

/** Flattens a nested object to dot-path leaves (objects recurse, arrays/strings are leaves). */
function flatten(obj, prefix = '', out = {}) {
 for (const [key, value] of Object.entries(obj)) {
  const path = prefix ? `${prefix}.${key}` : key
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out)
  else out[path] = value
 }
 return out
}

/** Parses the authoritative LANGUAGE_CODES list out of the TypeScript source (same regex as the generator). */
function parseLanguageCodes() {
 const source = readFileSync(LOCALES_TS_URL, 'utf8')
 const match = source.match(/export const LANGUAGE_CODES = \[([^\]]+)\] as const/)
 if (!match) throw new Error('LANGUAGE_CODES not found in src/core/i18n/locales.ts')
 const tokens = match[1].match(/'[^']+'/g)
 if (!tokens) throw new Error('LANGUAGE_CODES in src/core/i18n/locales.ts contains no quoted tokens')
 return tokens.map((token) => token.slice(1, -1))
}

function main() {
 const codes = parseLanguageCodes()
 const idFlat = flatten(JSON.parse(readFileSync(ID_JSON_URL, 'utf8')))
 const idKeys = Object.keys(idFlat)
 let hasViolations = false
 for (const lang of codes) {
  const url = new URL(`${lang}.json`, LANG_DIR_URL)
  if (!existsSync(url)) {
   console.log(`${lang} * missing file`)
   hasViolations = true
   continue
  }
  let locale
  try {
   locale = JSON.parse(readFileSync(url, 'utf8'))
  } catch {
   console.log(`${lang} * invalid json`)
   hasViolations = true
   continue
  }
  const violations = collectParityViolations(idKeys, locale, lang)
  if (violations.length > 0) {
   for (const violation of violations) console.log(violation)
   hasViolations = true
  } else {
   console.log(`OK ${lang}`)
  }
 }
 if (hasViolations) process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (invokedPath !== null && import.meta.url === invokedPath) {
 try {
  main()
 } catch (error) {
  console.error(error)
  process.exit(1)
 }
}

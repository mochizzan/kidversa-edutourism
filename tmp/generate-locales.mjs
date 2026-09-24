#!/usr/bin/env node
/**
 * Incremental locale generator: translates frontend/src/locales/id.json into
 * every LANGUAGE_CODES target using Google AI Studio (Gemini).
 *
 * Usage (from the repo root):
 *   GEMINI_API_KEY=<key> node tmp/generate-locales.mjs          # incremental (keep existing, translate missing)
 *   GEMINI_API_KEY=<key> node tmp/generate-locales.mjs --all    # retranslate every key from scratch
 *
 * Env: GEMINI_API_KEY (required, read only from the environment — never written
 * to any file), GEMINI_MODEL (pin a single model; default rotates round-robin across gemini-3.6-flash, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.1-flash-lite — gemini-2.5-flash dropped 2026-09-24: generateContent answers 404 "no longer available to new users").
 * Never fabricates text: a batch that exhausts its retries prints
 * `FAILED <lang> batch <n>`, skips that language's file, and exits non-zero.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const GLOSSARY = ['Kidversa', 'Kidversa Edutourism', 'Super Admin', 'Admin', 'Koordinator', 'Fasilitator', 'HAPUS']

const SOURCE_LANGUAGE = 'id'
const BATCH_SIZE = 50
const MAX_ATTEMPTS = 7
const BACKOFF_MS = [1000, 2000, 5000, 15000, 30000, 45000, 0]
const MODELS = process.env.GEMINI_MODEL
 ? [process.env.GEMINI_MODEL]
 : ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
const API_KEY = process.env.GEMINI_API_KEY
// Round-robin per API call (user directive 2026-09-24): every request advances the
// cursor, so a per-model 429 is served by the next model on the following attempt.
// gemini-2.5-flash (from the user's list) was dropped 2026-09-24: GET metadata answers
// 200 but generateContent answers 404 "no longer available to new users". Healthy-first
// order minimizes backoff; the lite models stay in the rotation to ride out quota windows.
let modelCursor = 0

const LANGUAGE_NAMES = { en: 'English', ms: 'Malay (Bahasa Melayu)', th: 'Thai (ภาษาไทย)', tl: 'Tagalog (Filipino)', ko: 'Korean (한국어)', zh: 'Chinese Simplified (简体中文)', ja: 'Japanese (日本語)', vi: 'Vietnamese (Tiếng Việt)' }
const PLACEHOLDER_RE = /\{\{[^{}]+\}\}/g

const LANG_DIR_URL = new URL('../frontend/src/locales/', import.meta.url)
const ID_JSON_URL = new URL('id.json', LANG_DIR_URL)
const LOCALES_TS_URL = new URL('../frontend/src/core/i18n/locales.ts', import.meta.url)

/** Splits `items` into consecutive batches of at most `size` elements. */
export function splitBatches(items, size) {
 if (size <= 0) throw new Error('splitBatches: size must be greater than 0')
 const batches = []
 for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
 return batches
}

/**
 * True when the trimmed, case-insensitive, whole-string value of `text`
 * matches a glossary term (glossary terms are never translated).
 */
export function isGlossaryTerm(text) {
 if (typeof text !== 'string') return false
 const trimmed = text.trim().toLowerCase()
 return GLOSSARY.some((term) => term.toLowerCase() === trimmed)
}

/**
 * Compares a locale object against the id.json key list.
 * Returns one `<lang> <key> <problem>` line per violation; empty when in parity.
 */
export function collectParityViolations(idKeys, locale, lang) {
 if (locale === null || typeof locale !== 'object' || Array.isArray(locale)) {
  return [`${lang} * missing file`]
 }
 const flat = flatten(locale)
 const idKeySet = new Set(idKeys)
 const localeKeys = Object.keys(flat)
 const localeKeySet = new Set(localeKeys)
 const violations = []
 for (const key of idKeys) {
  if (!localeKeySet.has(key)) {
   violations.push(`${lang} ${key} missing key`)
   continue
  }
  const value = flat[key]
  if (typeof value !== 'string') violations.push(`${lang} ${key} invalid value`)
  else if (value === '') violations.push(`${lang} ${key} empty value`)
 }
 for (const key of localeKeys) {
  if (!idKeySet.has(key)) violations.push(`${lang} ${key} extra key`)
 }
 return violations
}

/** Flattens a nested object to dot-path leaves (objects recurse, arrays/strings are leaves). */
function flatten(obj, prefix = '', out = {}) {
 for (const [key, value] of Object.entries(obj)) {
  const path = prefix ? `${prefix}.${key}` : key
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out)
  else out[path] = value
 }
 return out
}

/** Rebuilds the nested catalog object from dot-path leaves (insertion order preserved). */
function unflatten(flat) {
 const root = {}
 for (const [key, value] of Object.entries(flat)) {
  const parts = key.split('.')
  let node = root
  for (let i = 0; i < parts.length - 1; i += 1) {
   const part = parts[i]
   if (node[part] === null || typeof node[part] !== 'object') node[part] = {}
   node = node[part]
  }
  node[parts[parts.length - 1]] = value
 }
 return root
}

/** Parses the authoritative LANGUAGE_CODES list out of the TypeScript source. */
function parseLanguageCodes() {
 const source = readFileSync(LOCALES_TS_URL, 'utf8')
 const match = source.match(/export const LANGUAGE_CODES = \[([^\]]+)\] as const/)
 if (!match) throw new Error('LANGUAGE_CODES not found in frontend/src/core/i18n/locales.ts')
 const tokens = match[1].match(/'[^']+'/g)
 if (!tokens) throw new Error('LANGUAGE_CODES in frontend/src/core/i18n/locales.ts contains no quoted tokens')
 return tokens.map((token) => token.slice(1, -1))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** One Gemini generateContent call; returns the translated array. */
async function requestTranslation(strings, lang) {
 const targetName = LANGUAGE_NAMES[lang] || lang
 const prompt = [
  `Translate an array of Indonesian UI strings into ${targetName} (code "${lang}") for a school SaaS web app (Kidversa Edutourism).`,
  'Rules:',
  '- Reply ONLY with a JSON array of strings: same length, same order as the input.',
  '- Preserve every {{placeholder}} token exactly (for example {{label}} or {{count}}); never translate or alter placeholders.',
  '- Keep the names "Kidversa" and "Kidversa Edutourism" unchanged.',
  "- Natural, concise UI wording (buttons, labels, validation and error messages); use the language's standard formal register.",
  `Input: ${JSON.stringify(strings)}`,
 ].join('\n')
 const model = MODELS[modelCursor % MODELS.length]
 modelCursor += 1
 const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
 const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
  body: JSON.stringify({
   contents: [{ role: 'user', parts: [{ text: prompt }] }],
   generationConfig: {
    temperature: 0,
    responseMimeType: 'application/json',
    responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
   },
  }),
 })
 if (!response.ok) {
  let detail = ''
  try {
   detail = JSON.stringify((await response.json()).error || {}).slice(0, 300)
  } catch {
   /* body was not JSON */
  }
  const error = new Error(`Gemini ${model} HTTP ${response.status} ${detail}`)
  // 404 here means "model no longer available" (endpoint template is fixed), so it
  // rotates to the next model instead of failing fast like other non-429 4xx.
  error.retryable = response.status === 404 || response.status === 429 || response.status >= 500
  throw error
 }
 const payload = await response.json()
 const blockReason = payload.promptFeedback && payload.promptFeedback.blockReason
 if (blockReason) {
  const error = new Error(`Gemini blocked the prompt: ${blockReason}`)
  error.retryable = false
  throw error
 }
 const candidate = payload.candidates && payload.candidates[0]
 const text = ((candidate && candidate.content && candidate.content.parts) || []).map((part) => part.text || '').join('')
 let texts
 try {
  texts = JSON.parse(text)
 } catch {
  const error = new Error(`Gemini response is not JSON: ${text.slice(0, 200)}`)
  error.retryable = true
  throw error
 }
 if (!Array.isArray(texts) || texts.length !== strings.length || !texts.every((item) => typeof item === 'string' && item !== '')) {
  const finish = candidate && candidate.finishReason ? ` finishReason=${candidate.finishReason}` : ''
  const error = new Error(`Gemini response mismatch: expected ${strings.length} non-empty strings, got ${JSON.stringify(texts).slice(0, 200)}${finish}`)
  error.retryable = true
  throw error
 }
 for (let i = 0; i < strings.length; i += 1) {
  const tokens = strings[i].match(PLACEHOLDER_RE) || []
  for (const token of tokens) {
   if (!texts[i].includes(token)) {
    const error = new Error(`Gemini dropped placeholder ${token} in item ${i}`)
    error.retryable = true
    throw error
   }
  }
 }
 return texts
}

/**
 * Translates one batch with up to 7 attempts; backoff 1s → 2s → 5s → 15s → 30s → 45s
 * (retries straddle quota-window boundaries; no sleep after the final attempt)
 * on network error, HTTP 429/5xx, length mismatch, or a dropped placeholder.
 * Throws the last error when retries are exhausted.
 */
async function translateBatch(strings, lang) {
 let lastError
 for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
  try {
   return await requestTranslation(strings, lang)
  } catch (error) {
   lastError = error
   if (error.retryable === false) break
   await sleep(BACKOFF_MS[attempt])
   if (attempt === MAX_ATTEMPTS - 1) break
  }
 }
 throw lastError
}

/** Generates one target language file. Skips the write when any batch fails. */
async function generateLanguage(lang, idFlat, idKeys, all) {
 const targetUrl = new URL(`${lang}.json`, LANG_DIR_URL)
 let existing = {}
 if (!all && existsSync(targetUrl)) {
  try {
   existing = flatten(JSON.parse(readFileSync(targetUrl, 'utf8')))
  } catch {
   existing = {}
  }
 }

 const result = {}
 let glossaryCount = 0
 const missingKeys = []
 for (const key of idKeys) {
  const source = idFlat[key]
  if (isGlossaryTerm(source)) {
   result[key] = source
   glossaryCount += 1
   continue
  }
  const preserved = existing[key]
  if (typeof preserved === 'string' && preserved !== '') {
   result[key] = preserved
   continue
  }
  missingKeys.push(key)
 }

 let failed = false
 const batches = splitBatches(missingKeys, BATCH_SIZE)
 for (const [batchIndex, batchKeys] of batches.entries()) {
  try {
   const texts = await translateBatch(batchKeys.map((key) => idFlat[key]), lang)
   batchKeys.forEach((key, index) => {
    result[key] = texts[index]
   })
  } catch (error) {
   console.log(`FAILED ${lang} batch ${batchIndex + 1}`)
   console.error(String(error instanceof Error ? error.message : error))
   process.exitCode = 1
   failed = true
   break
  }
 }
 if (failed) return

 writeFileSync(targetUrl, `${JSON.stringify(unflatten(result), null, 2)}\n`, 'utf8')
 console.log(`${SOURCE_LANGUAGE} → ${lang}: ${idKeys.length} keys (${idKeys.length - glossaryCount} translated, ${glossaryCount} glossary)`)
}

/** Self-validates parity for every language; returns true when any violation was found. */
function verifyParity(codes, idKeys) {
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
  }
 }
 return hasViolations
}

async function main() {
 if (!API_KEY) {
  console.error('GEMINI_API_KEY is required, e.g. GEMINI_API_KEY=<key> node tmp/generate-locales.mjs')
  process.exit(1)
 }
 const all = process.argv.includes('--all')
 const codes = parseLanguageCodes()
 const idFlat = flatten(JSON.parse(readFileSync(ID_JSON_URL, 'utf8')))
 const idKeys = Object.keys(idFlat)
 for (const lang of codes) {
  if (lang === SOURCE_LANGUAGE) continue
  await generateLanguage(lang, idFlat, idKeys, all)
 }
 if (verifyParity(codes, idKeys)) process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (invokedPath !== null && import.meta.url === invokedPath) {
 main().catch((error) => {
  console.error(error)
  process.exit(1)
 })
}

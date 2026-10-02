#!/usr/bin/env node
/**
 * Static-asset version stamper (P2-4).
 *
 * Appends `?v=<package.json version>` to the stable (unhashed) asset URLs in
 * index.html and public/manifest.webmanifest. nginx serves those assets with
 * `expires 1y` + `Cache-Control: public, immutable`, so a version query is what
 * forces a fresh browser cache entry on every release (the nginx location
 * regexes match on path, not query, so the immutable rule still applies).
 *
 * Properties:
 * - Idempotent: an existing `?v=...` on a target URL is REPLACED, never stacked.
 * - Fail-fast: exits non-zero if any target URL did not get stamped.
 * - Wired into `pnpm build` BEFORE `vite build`, so the stamp flows into dist/
 *   (vite copies public/ verbatim and leaves public-dir URLs in index.html).
 *
 * Usage (from frontend/): node scripts/stamp-version.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const FRONTEND_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

/** file (relative to frontend/) → stable asset URLs inside it that need ?v= */
const TARGETS = {
 'index.html': ['/favicon.svg', '/apple-touch-icon.png', '/manifest.webmanifest'],
 'public/manifest.webmanifest': [
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-512-maskable.png',
  '/apple-touch-icon.png',
 ],
}

function escapeRegExp(text) {
 return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Stamps every `urls` entry in `content`. Matches the bare URL optionally
 * followed by an existing `?v=...` query, and only when the very next
 * character is a closing quote (attribute or JSON string) — so a re-run
 * rewrites the same query in place instead of appending a second one.
 */
function stamp(content, urls, version) {
 let result = content
 for (const url of urls) {
  const pattern = new RegExp(`${escapeRegExp(url)}(?:\\?v=[^"']*)?(?=["'])`, 'g')
  result = result.replace(pattern, `${url}?v=${version}`)
 }
 return result
}

function main() {
 const pkg = JSON.parse(readFileSync(join(FRONTEND_DIR, 'package.json'), 'utf8'))
 const version = pkg.version
 if (!version) {
  console.error('stamp-version: package.json has no "version" field')
  process.exit(1)
 }
 let updated = 0
 for (const [relPath, urls] of Object.entries(TARGETS)) {
  const filePath = join(FRONTEND_DIR, relPath)
  const original = readFileSync(filePath, 'utf8')
  const stamped = stamp(original, urls, version)
  const missing = urls.filter((url) => !stamped.includes(`${url}?v=${version}`))
  if (missing.length > 0) {
   console.error(`stamp-version: ${relPath}: URL(s) not found: ${missing.join(', ')}`)
   process.exit(1)
  }
  if (stamped !== original) {
   writeFileSync(filePath, stamped, 'utf8')
   updated += 1
  }
  console.log(`stamp-version: ${relPath} → ${urls.length} URL(s) ?v=${version}`)
 }
 console.log(updated > 0 ? `stamp-version: ${updated} file(s) updated` : 'stamp-version: already stamped (idempotent no-op)')
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (invokedPath !== null && import.meta.url === invokedPath) {
 main()
}

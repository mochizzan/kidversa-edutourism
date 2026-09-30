// Origin tracking for form pages: the entry button stamps the page it was
// clicked on into the form URL (?from=...), and Cancel resolves that stamp so
// the back flow returns to the origin page (table ↔ detail/overview) instead
// of a hard-coded target. Pure helpers — unit-tested in
// tests/unit/navigation.test.ts.

export const ORIGIN_PARAM = 'from'

/** Append the origin page (path + query) to `path` as the ?from= stamp. */
export function withOrigin(path: string, origin: string): string {
 const sep = path.includes('?') ? '&' : '?'
 return `${path}${sep}${ORIGIN_PARAM}=${encodeURIComponent(origin)}`
}

/**
 * Resolve the Cancel target from a form URL's search string.
 * Returns the stamped origin when it is a safe in-app path, otherwise
 * `fallbackPath` (the module's list page) — ?from= is user-controllable,
 * so absolute URLs, protocol-relative hosts and backslash tricks are rejected.
 */
export function resolveCancelTarget(search: string, fallbackPath: string): string {
 const raw = new URLSearchParams(search).get(ORIGIN_PARAM)
 if (!raw) return fallbackPath
 if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallbackPath
 return raw
}

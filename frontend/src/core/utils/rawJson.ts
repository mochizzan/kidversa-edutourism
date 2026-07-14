// rawJson.ts — decode a backend RawJSON column.
//
// RawJSON columns arrive from the backend as a JSON string (or base64 of the
// JSON bytes, depending on the GORM/MySQL driver). This normalizes both forms
// back into the native typed value the frontend expects.
export function parseRawJSON<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'string') return value as T
  const trimmed = value.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as T
    } catch {
      return fallback
    }
  }
  try {
    const decoded = atob(trimmed)
    return JSON.parse(decoded) as T
  } catch {
    return fallback
  }
}

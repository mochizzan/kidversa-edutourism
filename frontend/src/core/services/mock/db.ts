const STORAGE_PREFIX = 'kidversa_mock_'

export const mockStorage = {
  get<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (!raw) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  },

  set<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value))
  },
}

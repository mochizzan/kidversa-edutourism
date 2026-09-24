import '@testing-library/jest-dom'

  ; (globalThis as Record<string, unknown>).IS_REACT_ACTEnvironment = true

// Force the app's i18n singleton to Indonesian before any test module loads it.
// Dynamic await import() is required: a static import hoists above the setItem,
// so the detector would resolve navigator.language instead of the seeded 'id'.
localStorage.setItem('kidversa_lang', 'id')
const { whenReady, i18n } = await import('./src/core/i18n')
await whenReady
void i18n // (referenced so linters keep the import; tests may import i18n themselves)
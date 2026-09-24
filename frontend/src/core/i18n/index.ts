import i18next from 'i18next'
import type { i18n as I18nInstance, InitOptions, BackendModule } from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import idRes from '../../locales/id.json'
import enRes from '../../locales/en.json'
import { LANGUAGE_CODES, RTL_LANGUAGE_CODES } from './locales'
import { STORAGE_KEYS } from '../constants/storage'

const dynamicBackend = {
  type: 'backend',
  init() { },
  read(language, _namespace, callback) {
    if (!LANGUAGE_CODES.includes(language as (typeof LANGUAGE_CODES)[number])) { callback(new Error('unsupported'), null); return }
    import(`../../locales/${language}.json`)
      .then((m) => callback(null, m.default))
      .catch((err) => callback(err, null))
  },
} as BackendModule

export function buildI18n(initLng?: string): { instance: I18nInstance; ready: Promise<I18nInstance> } {
  const instance = i18next.createInstance().use(initReactI18next).use(new LanguageDetector()).use(dynamicBackend)
  const options: InitOptions = {
    ...(initLng ? { lng: initLng } : {}),
    fallbackLng: 'id',
    supportedLngs: [...LANGUAGE_CODES],
    nonExplicitSupportedLngs: true,
    defaultNS: 'translation',
    resources: { id: { translation: idRes }, en: { translation: enRes } },
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: STORAGE_KEYS.LANG,   // 'kidversa_lang'
    },
  }
  const applyDir = (lng?: string) => {
    const code = lng ?? ''
    document.documentElement.dir = RTL_LANGUAGE_CODES.includes(code as (typeof RTL_LANGUAGE_CODES)[number]) ? 'rtl' : 'ltr'
  }
  const ready = instance.init(options).then(() => { applyDir(instance.resolvedLanguage); return instance })
  instance.on('languageChanged', applyDir)
  return { instance, ready }
}

const built = buildI18n()
export const i18n = built.instance
export const whenReady = built.ready

/** Exists-check + translated lookup: returns undefined for unknown keys or non-string values. */
export function tIfExists(key: string, options?: Record<string, unknown>): string | undefined {
  if (!i18n.exists(key)) return undefined
  return i18n.t(key as never, options as never) as unknown as string
}

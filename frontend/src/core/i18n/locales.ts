export const SOURCE_LANGUAGE = 'id'
export const LANGUAGE_CODES = ['id', 'en', 'ms', 'th', 'tl', 'ko', 'zh', 'ja', 'vi'] as const
export type LanguageCode = (typeof LANGUAGE_CODES)[number]

export interface LanguageMeta {
  code: LanguageCode
  country: string // ISO 3166-1 alpha-2
  endonym: string // native name, shown prominently
  english: string // English name, shown secondary + used for search
}

export const LANGUAGES: readonly LanguageMeta[] = [
  { code: 'id', country: 'ID', endonym: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'en', country: 'GB', endonym: 'English', english: 'English' },
  { code: 'ms', country: 'MY', endonym: 'Bahasa Melayu', english: 'Malay' },
  { code: 'th', country: 'TH', endonym: 'ไทย', english: 'Thai' },
  { code: 'tl', country: 'PH', endonym: 'Tagalog', english: 'Tagalog' },
  { code: 'ko', country: 'KR', endonym: '한국어', english: 'Korean' },
  { code: 'zh', country: 'CN', endonym: '中文', english: 'Chinese' },
  { code: 'ja', country: 'JP', endonym: '日本語', english: 'Japanese' },
  { code: 'vi', country: 'VN', endonym: 'Tiếng Việt', english: 'Vietnamese' },
]

export const RTL_LANGUAGE_CODES = [] as const

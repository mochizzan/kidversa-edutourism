export const SOURCE_LANGUAGE = 'id'
export const LANGUAGE_CODES = ['id', 'en', 'ms', 'th', 'tl', 'ko', 'zh', 'ja', 'vi'] as const
export type LanguageCode = (typeof LANGUAGE_CODES)[number]

export interface LanguageMeta {
  code: LanguageCode
  flag: string // emoji regional indicator
  endonym: string // native name, shown prominently
  english: string // English name, shown secondary + used for search
}

export const LANGUAGES: readonly LanguageMeta[] = [
  { code: 'id', flag: '🇮🇩', endonym: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'en', flag: '🇬🇧', endonym: 'English', english: 'English' },
  { code: 'ms', flag: '🇲🇾', endonym: 'Bahasa Melayu', english: 'Malay' },
  { code: 'th', flag: '🇹🇭', endonym: 'ไทย', english: 'Thai' },
  { code: 'tl', flag: '🇵🇭', endonym: 'Tagalog', english: 'Tagalog' },
  { code: 'ko', flag: '🇰🇷', endonym: '한국어', english: 'Korean' },
  { code: 'zh', flag: '🇨🇳', endonym: '中文', english: 'Chinese' },
  { code: 'ja', flag: '🇯🇵', endonym: '日本語', english: 'Japanese' },
  { code: 'vi', flag: '🇻🇳', endonym: 'Tiếng Việt', english: 'Vietnamese' },
]

export const RTL_LANGUAGE_CODES = [] as const

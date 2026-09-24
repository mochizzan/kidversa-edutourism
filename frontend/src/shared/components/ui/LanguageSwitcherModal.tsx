import { useState } from 'react'
import { Check, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import { LANGUAGES } from '@/core/i18n/locales'
import { cn } from '../../../core/utils'

interface LanguageSwitcherModalProps { open: boolean; onClose: () => void }

export function LanguageSwitcherModal({ open, onClose }: LanguageSwitcherModalProps) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = LANGUAGES.filter((l) =>
    !q || l.endonym.toLowerCase().includes(q) || l.english.toLowerCase().includes(q) || l.code.toLowerCase().includes(q))
  const active = i18n.resolvedLanguage ?? 'id'
  const select = (code: string) => { void i18n.changeLanguage(code); onClose() }
  return (
    <Modal open={open} onClose={onClose} title={t('common.language.title')}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
        <input
          autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={t('common.language.searchPlaceholder')} aria-label={t('common.language.searchPlaceholder')}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant text-sm text-on-surface placeholder:text-on-surface-variant"
        />
      </div>
      <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto">
        {filtered.map((l) => (
          <button key={l.code} type="button" onClick={() => select(l.code)}
            data-lang-code={l.code}
            aria-current={active === l.code ? 'true' : undefined}
            className={cn('flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors',
              active === l.code ? 'bg-primary-container text-on-primary-container' : 'text-on-surface hover:bg-surface-container')}>
            <span className="text-lg leading-none" aria-hidden="true">{l.flag}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">{l.endonym}</span>
              <span className="block text-xs text-on-surface-variant truncate">{l.english}</span>
            </span>
            {active === l.code && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="py-4 text-center text-sm text-on-surface-variant">{t('common.language.empty')}</p>
        )}
      </div>
    </Modal>
  )
}

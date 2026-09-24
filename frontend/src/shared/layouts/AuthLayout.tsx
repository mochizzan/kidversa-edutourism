import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { LanguageSwitcherModal } from '../components/ui/LanguageSwitcherModal'

const AuthLayout = () => {
  const location = useLocation()
  const { t } = useTranslation()
  const [langOpen, setLangOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-surface to-accent-50 flex flex-col md:items-center md:justify-center relative overflow-hidden">
      {/* ── Animated background blobs ── */}
      <div
        className="absolute -top-24 -right-24 w-96 h-96 bg-primary/[0.07] rounded-full blur-3xl pointer-events-none animate-float"
        style={{ animationDelay: '-2s' }}
      />
      <div
        className="absolute -bottom-32 -left-32 w-[30rem] h-[30rem] bg-accent/[0.07] rounded-full blur-3xl pointer-events-none animate-float-slow"
        style={{ animationDelay: '-5s' }}
      />
      <div
        className="absolute top-1/4 left-1/3 -translate-x-1/2 w-64 h-64 bg-primary-200/20 rounded-full blur-3xl pointer-events-none animate-float"
        style={{ animationDelay: '-8s' }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-accent-200/20 rounded-full blur-3xl pointer-events-none animate-float-slow"
        style={{ animationDelay: '-3s' }}
      />

      <div className="w-full md:max-w-sm md:mx-auto md:px-4 flex-1 md:flex-initial flex flex-col relative z-10">
        {/* ── Card ── */}
        <div className="bg-surface md:rounded-2xl md:shadow-lg md:shadow-primary/5 md:border md:border-outline-variant/30 overflow-hidden flex-1 md:flex-initial flex flex-col">
          <div className="px-5 md:px-8 py-6 flex-1 flex flex-col">
            {/* Page content with mount animation */}
            <div
              key={location.pathname}
              className="animate-fade-in-up flex-1 flex flex-col"
            >
              <Outlet />
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="py-5 text-center relative z-10">
        <p className="text-xs text-on-surface-variant/30 font-medium tracking-wide">
          &copy; 2026 Kidversa Edutourism
        </p>
      </div>

      <button type="button" onClick={() => setLangOpen(true)} aria-label={t('common.language.buttonAria')}
        className="fixed bottom-4 left-4 z-10 p-3 rounded-full bg-surface/80 backdrop-blur border border-outline-variant text-on-surface-variant shadow-sm hover:text-on-surface transition-colors">
        <Globe className="w-5 h-5" />
      </button>
      <LanguageSwitcherModal open={langOpen} onClose={() => setLangOpen(false)} />
    </div>
  )
}

export default AuthLayout

import { useTranslation } from 'react-i18next'

export function DemoHint() {
  const { t } = useTranslation()
  // Hanya untuk dev/staging (VITE_DEMO_MODE=true). Production: tidak dirender.
  return (
    <div className="p-3 rounded-xl bg-primary-container/40 border border-primary-100/60">
      <p className="text-xs text-on-primary-container/60 text-center leading-relaxed">
        {t('auth.demo.hint')}
      </p>
    </div>
  )
}

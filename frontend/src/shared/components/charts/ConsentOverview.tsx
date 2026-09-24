import { useTranslation } from 'react-i18next'
import { Camera } from 'lucide-react'

interface ConsentOverviewProps {
  photoConsented: number
  total: number
  title?: string
}

export function ConsentOverview({
  photoConsented,
  total,
  title,
}: ConsentOverviewProps) {
  const { t } = useTranslation()
  const photoPct = total > 0 ? (photoConsented / total) * 100 : 0

  return (
    <div className="bg-surface rounded-3xl p-6 shadow-sm">
      <h2 className="text-lg font-bold text-on-surface mb-4">{title ?? t('common.chart.consentTitle')}</h2>
      {total === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">{t('common.chart.consentEmpty')}</p>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-on-surface">{t('common.chart.consentPhoto')}</span>
              </div>
              <span className="text-sm font-bold text-on-surface">{photoPct.toFixed(0)}%</span>
            </div>
            <div className="bg-surface-container-low rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${photoPct}%` }}
              />
            </div>
            <p className="text-xs text-on-surface-variant mt-1">{t('common.chart.consentOf', { consented: photoConsented, total })}</p>
          </div>
        </div>
      )}
    </div>
  )
}

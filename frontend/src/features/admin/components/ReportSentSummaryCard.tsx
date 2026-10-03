import { Card } from '../../../shared/components/ui/Card'
import { formatDate } from '../../../shared/utils'
import { useTranslation } from 'react-i18next'

interface ReportSentSummaryCardProps {
 /**
  * The exact WhatsApp text the server sends for this report
  * (GET /api/reports/:id/message) — rendered VERBATIM, never re-assembled
  * from narrative/mission/photo fragments (those already live inside it).
  * null while loading or when the fetch failed.
  */
 message: string | null
 loading: boolean
 error: boolean
 sentAt?: string | null
}

export const ReportSentSummaryCard = ({
 message,
 loading,
 error,
 sentAt,
}: ReportSentSummaryCardProps) => {
 const { t } = useTranslation()
 const showPlaceholder = loading || error || message === null

 return (
  <Card
   title={t('admin.review.sentSummaryTitle')}
   subtitle={t('admin.review.sentSummarySubtitle')}
  >
   <div className="space-y-4">
    <p className="text-sm text-on-surface whitespace-pre-wrap">
     {showPlaceholder ? '-' : message}
    </p>
    <p className="text-xs text-on-surface-variant">
     {t('admin.review.sentAt', { date: sentAt ? formatDate(sentAt) : '-' })}
    </p>
   </div>
  </Card>
 )
}

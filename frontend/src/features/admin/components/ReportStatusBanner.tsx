import { Badge } from '../../../shared/components/ui/Badge'
import { Button } from '../../../shared/components/ui/Button'
import { cn } from '../../../core/utils'
import { formatDate } from '../../../shared/utils'
import { ReportStatus } from '../../../core/types/enums'
import { useTranslation } from 'react-i18next'
import {
  reportStatusBadge,
  reportStatusLabel,
  reportStatusBg,
} from '../../../core/constants/reportStatus'
import type { Report } from '../../../core/types'

interface ReportStatusBannerProps {
  report: Report
  copiedLink: boolean
  onCopyLink: (link: string) => void
}

export const ReportStatusBanner = ({ report, copiedLink, onCopyLink }: ReportStatusBannerProps) => {
  const { t } = useTranslation()
  const parentLink = report.parent_access_token
    ? `${window.location.origin}/parent/report?token=${report.parent_access_token}`
    : ''

  return (
    <div className={cn('rounded-2xl p-4 flex flex-col gap-3 no-print', reportStatusBg[report.status])}>
      <div className="flex items-center gap-3">
        <Badge variant={reportStatusBadge[report.status] || 'neutral'} size="md">
          {t(reportStatusLabel[report.status]) || report.status}
        </Badge>
        <span className="text-sm font-medium">
          {report.status === ReportStatus.SENT
            ? t('admin.reports.statusSent', { date: report.sent_at ? formatDate(report.sent_at) : '-' })
            : report.status === ReportStatus.APPROVED
              ? t('admin.reports.statusApproved')
              : report.status === ReportStatus.DRAFT
                ? t('admin.reports.statusDraft')
                : t('admin.reports.statusReview')}
        </span>
      </div>
      {report.status === ReportStatus.SENT && report.parent_access_token && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs bg-black/10 px-2 py-1 rounded-lg break-all">{parentLink}</code>
          <Button variant="ghost" size="sm" onClick={() => onCopyLink(parentLink)}>
            {copiedLink ? t('admin.reports.copied') : t('admin.reports.copyLink')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              window.open(`/parent/report?token=${report.parent_access_token}`, '_blank')
            }
          >
            {t('admin.reports.openParentPage')}
          </Button>
        </div>
      )}
    </div>
  )
}

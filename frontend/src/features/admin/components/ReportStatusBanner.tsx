import { Badge } from '../../../shared/components/ui/Badge'
import { Button } from '../../../shared/components/ui/Button'
import { cn, formatDate } from '../../../core/utils'
import { ReportStatus } from '../../../core/types/enums'
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
  const parentLink = report.parent_access_token
    ? `${window.location.origin}/parent/report?token=${report.parent_access_token}`
    : ''

  return (
    <div className={cn('rounded-2xl p-4 flex flex-col gap-3 no-print', reportStatusBg[report.status])}>
      <div className="flex items-center gap-3">
        <Badge variant={reportStatusBadge[report.status] || 'neutral'} size="md">
          {reportStatusLabel[report.status] || report.status}
        </Badge>
        <span className="text-sm font-medium">
          {report.status === ReportStatus.SENT
            ? `Laporan telah dikirim pada ${report.sent_at ? formatDate(report.sent_at) : '-'}`
            : report.status === ReportStatus.APPROVED
              ? 'Laporan sudah disetujui dan siap dikirim ke orang tua'
              : report.status === ReportStatus.DRAFT
                ? 'Laporan masih dalam bentuk draft, review sebelum dikirim'
                : 'Laporan menunggu review'}
        </span>
      </div>
      {report.status === ReportStatus.SENT && report.parent_access_token && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs bg-black/10 px-2 py-1 rounded-lg break-all">{parentLink}</code>
          <Button variant="ghost" size="sm" onClick={() => onCopyLink(parentLink)}>
            {copiedLink ? 'Tersalin' : 'Salin Link'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              window.open(`/parent/report?token=${report.parent_access_token}`, '_blank')
            }
          >
            Buka Halaman Orang Tua
          </Button>
        </div>
      )}
    </div>
  )
}

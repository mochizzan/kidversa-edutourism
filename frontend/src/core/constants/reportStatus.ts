import { ReportStatus } from '../types/enums'

export type ReportStatusBadge = 'neutral' | 'warning' | 'success' | 'primary'

export const reportStatusBadge: Record<ReportStatus, ReportStatusBadge> = {
  [ReportStatus.DRAFT]: 'neutral',
  [ReportStatus.PENDING_REVIEW]: 'warning',
  [ReportStatus.APPROVED]: 'success',
  [ReportStatus.SENT]: 'primary',
  [ReportStatus.SEND_FAILED]: 'warning',
}

export const reportStatusLabel = {
  [ReportStatus.DRAFT]: 'admin.reportStatus.draft',
  [ReportStatus.PENDING_REVIEW]: 'admin.reportStatus.pendingReview',
  [ReportStatus.APPROVED]: 'admin.reportStatus.approved',
  [ReportStatus.SENT]: 'admin.reportStatus.sent',
  [ReportStatus.SEND_FAILED]: 'admin.reportStatus.sendFailed',
} as const satisfies Record<ReportStatus, string>

export const reportStatusBg: Record<ReportStatus, string> = {
  [ReportStatus.DRAFT]: 'bg-surface-variant text-on-surface-variant',
  [ReportStatus.PENDING_REVIEW]: 'bg-yellow-100 text-yellow-700',
  [ReportStatus.APPROVED]: 'bg-green-100 text-green-700',
  [ReportStatus.SENT]: 'bg-primary-container text-on-primary-container',
  [ReportStatus.SEND_FAILED]: 'bg-red-100 text-red-700',
}

/** Reports the admin may deliver (or re-deliver) via WhatsApp. */
export const isSendableReportStatus = (status: ReportStatus): boolean =>
  status === ReportStatus.APPROVED || status === ReportStatus.SEND_FAILED

export const NO_ASSESSMENT_LABEL = 'common.assessment.rating0'
export const NO_ASSESSMENT_BADGE: ReportStatusBadge = 'warning'
export const NO_REPORT_LABEL = 'admin.reportStatus.noReport'
export const NO_REPORT_BADGE: ReportStatusBadge = 'neutral'

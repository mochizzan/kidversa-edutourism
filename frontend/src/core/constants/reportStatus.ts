import { ReportStatus } from '../types/enums'

export type ReportStatusBadge = 'neutral' | 'warning' | 'success' | 'primary'

export const reportStatusBadge: Record<ReportStatus, ReportStatusBadge> = {
  [ReportStatus.DRAFT]: 'neutral',
  [ReportStatus.PENDING_REVIEW]: 'warning',
  [ReportStatus.APPROVED]: 'success',
  [ReportStatus.SENT]: 'primary',
}

export const reportStatusLabel = {
  [ReportStatus.DRAFT]: 'admin.reportStatus.draft',
  [ReportStatus.PENDING_REVIEW]: 'admin.reportStatus.pendingReview',
  [ReportStatus.APPROVED]: 'admin.reportStatus.approved',
  [ReportStatus.SENT]: 'admin.reportStatus.sent',
} as const satisfies Record<ReportStatus, string>

export const reportStatusBg: Record<ReportStatus, string> = {
  [ReportStatus.DRAFT]: 'bg-surface-variant text-on-surface-variant',
  [ReportStatus.PENDING_REVIEW]: 'bg-yellow-100 text-yellow-700',
  [ReportStatus.APPROVED]: 'bg-green-100 text-green-700',
  [ReportStatus.SENT]: 'bg-primary-container text-on-primary-container',
}

export const NO_ASSESSMENT_LABEL = 'common.assessment.rating0'
export const NO_ASSESSMENT_BADGE: ReportStatusBadge = 'warning'
export const NO_REPORT_LABEL = 'admin.reportStatus.noReport'
export const NO_REPORT_BADGE: ReportStatusBadge = 'neutral'

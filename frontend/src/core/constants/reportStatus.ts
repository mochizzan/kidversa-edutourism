import { ReportStatus } from '../types/enums'

export type ReportStatusBadge = 'neutral' | 'warning' | 'success' | 'primary'

export const reportStatusBadge: Record<ReportStatus, ReportStatusBadge> = {
  [ReportStatus.DRAFT]: 'neutral',
  [ReportStatus.PENDING_REVIEW]: 'warning',
  [ReportStatus.APPROVED]: 'success',
  [ReportStatus.SENT]: 'primary',
}

export const reportStatusLabel: Record<ReportStatus, string> = {
  [ReportStatus.DRAFT]: 'Draft',
  [ReportStatus.PENDING_REVIEW]: 'Perlu Review',
  [ReportStatus.APPROVED]: 'Disetujui',
  [ReportStatus.SENT]: 'Terkirim',
}

export const reportStatusBg: Record<ReportStatus, string> = {
  [ReportStatus.DRAFT]: 'bg-surface-variant text-on-surface-variant',
  [ReportStatus.PENDING_REVIEW]: 'bg-yellow-100 text-yellow-700',
  [ReportStatus.APPROVED]: 'bg-green-100 text-green-700',
  [ReportStatus.SENT]: 'bg-primary-container text-on-primary-container',
}

export const NO_ASSESSMENT_LABEL = 'Belum Dinilai'
export const NO_ASSESSMENT_BADGE: ReportStatusBadge = 'warning'
export const NO_REPORT_LABEL = 'Belum Ada Laporan'
export const NO_REPORT_BADGE: ReportStatusBadge = 'neutral'

import { ReportStatus } from '../types/enums'
import type { ReportGenerateOperation, ReportSendOperation } from '../services/types'

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

// ---------------------------------------------------------------------------
// Per-row delivery overlay (server operation registries)
// ---------------------------------------------------------------------------

/** Overlay states shared by the generate and send flows. */
export type ReportDeliveryState = 'processing' | 'queued'

/** The two operation registries exposed by GET /api/reports (both omitempty). */
export interface ReportDeliveryFlags {
 activeGenerate?: ReportGenerateOperation | null
 activeSend?: ReportSendOperation | null
}

/**
 * i18n keys for the overlay states. Generate-driven and send-driven rows use
 * the IDENTICAL keys/components — that equality is the "identical treatment"
 * requirement, so both flows must go through this map.
 */
export const REPORT_DELIVERY_LABEL = {
 processing: 'admin.status.processing',
 queued: 'admin.status.queued',
} as const satisfies Record<ReportDeliveryState, string>

/**
 * Pure per-row state mapping (unit-testable), priority order:
 *   1. id ∈ active_send.sending_ids OR active_generate.processing_ids → 'processing'
 *   2. id ∈ active_send.queued_ids    OR active_generate.queued_ids   → 'queued'
 *   3. else → null: the caller renders the EXISTING persisted-status UI
 *      (reportStatus rules / badges / generate+send affordances) unchanged.
 *
 * Server registries are authoritative: while an operation runs, its rows show
 * the overlay; when the flags vanish, rows fall back to persisted truth
 * (terminal SENT/SEND_FAILED affordances = the existing resend-mode rules).
 */
export function getReportDeliveryState(
 reportId: string | null | undefined,
 flags: ReportDeliveryFlags,
): ReportDeliveryState | null {
 if (!reportId) return null
 const generate = flags.activeGenerate
 const send = flags.activeSend
 if (send?.sending_ids?.includes(reportId)) return 'processing'
 if (generate?.processing_ids?.includes(reportId)) return 'processing'
 if (send?.queued_ids?.includes(reportId)) return 'queued'
 if (generate?.queued_ids?.includes(reportId)) return 'queued'
 return null
}

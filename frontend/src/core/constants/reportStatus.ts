import { ReportStatus } from '../types/enums'
import type { Report } from '../types'
import type {
 ReportGenerateItemStatus,
 ReportGenerateOperation,
 ReportGeneratePhase,
 ReportSendOperation,
} from '../services/types'

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

// ---------------------------------------------------------------------------
// Per-row generate state (server extras + persistent evidence only)
// ---------------------------------------------------------------------------

/** Row-level generate status: registry lifecycle or a registry-loss verdict. */
export type GenerateRowStatus = ReportGenerateItemStatus | 'interrupted'

export interface GenerateRowState {
 status: GenerateRowStatus
 /** Which phase is running / failed, when the server reported one. */
 phase?: ReportGeneratePhase
 /** Failure message (status === 'error'). */
 message?: string
}

/** Observed per-item failure that outlived the registry (registry loss). */
export interface RecordedGenerateError {
 message: string
 phase?: ReportGeneratePhase
}

/** i18n keys for the generate row statuses (live items and registry-gone verdicts). */
export const GENERATE_ROW_LABEL = {
 queued: 'admin.status.queued',
 processing: 'admin.status.processing',
 success: 'admin.status.completed',
 error: 'admin.status.error',
 interrupted: 'admin.status.interrupted',
} as const satisfies Record<GenerateRowStatus, string>

/** i18n keys for the phase shown alongside processing/error generate rows. */
export const GENERATE_PHASE_LABEL = {
 narrative: 'admin.status.phaseNarrative',
 missions: 'admin.status.phaseMissions',
} as const satisfies Record<ReportGeneratePhase, string>

/** Inputs for one row's generate state — all server-derived, never local status. */
export interface GenerateRowFlags {
 activeGenerate?: ReportGenerateOperation | null
 /** Report ids ever observed in a run this page session (rebuilt from extras). */
 watchedIds?: ReadonlySet<string> | readonly string[]
 /** reportID → per-item failure captured from active_generate items. */
 recordedErrors?: ReadonlyMap<string, RecordedGenerateError>
}

/**
 * Persistent completion evidence for a report: a non-empty narrative draft
 * (narasi selesai) AND persisted missions (misi selesai). Anything less when
 * the registry is gone means the run never finished this row.
 */
function generateEvidenceComplete(
 report: Pick<Report, 'ai_narrative_draft' | 'mission_ids'> | null | undefined,
): boolean {
 const draft =
  typeof report?.ai_narrative_draft === 'string' && report.ai_narrative_draft.length > 0
 if (!draft) return false
 return Array.isArray(report?.mission_ids) && report.mission_ids.length > 0
}

/**
 * Pure per-row generate state: the active_generate items are authoritative
 * while the registry lives; once it vanishes (run ended or server restart),
 * a watched row resolves from persistent evidence — complete → 'success',
 * a recorded failure → 'error' with its message, otherwise 'interrupted'
 * (never a fake "done"). Rows outside every observed run report null so the
 * caller renders the existing persisted-status UI unchanged.
 *
 * Depends only on (report id, entity evidence, server extras, watch/error
 * sets derived from those extras) — identical inputs always yield identical
 * output, which is what makes a reload rebuild the same state.
 */
export function getGenerateRowState(
 reportId: string | null | undefined,
 report: Pick<Report, 'ai_narrative_draft' | 'mission_ids'> | null | undefined,
 flags: GenerateRowFlags,
): GenerateRowState | null {
 if (!reportId) return null
 const gen = flags.activeGenerate ?? null
 const item = gen?.items?.find((i) => i.report_id === reportId)
 if (item) {
  if (item.status === 'error') return { status: 'error', phase: item.phase, message: item.error }
  return item.phase ? { status: item.status, phase: item.phase } : { status: item.status }
 }
 if (gen) {
  // Defensive: legacy id views if a server ever omits items for this row.
  if (gen.processing_ids.includes(reportId)) return { status: 'processing' }
  if (gen.queued_ids.includes(reportId)) return { status: 'queued' }
 }
 const watched =
  flags.watchedIds instanceof Set
   ? flags.watchedIds.has(reportId)
   : (flags.watchedIds as readonly string[] | undefined)?.includes(reportId) ?? false
 const recorded = flags.recordedErrors?.get(reportId)
 if (!watched && !recorded) return null
 if (generateEvidenceComplete(report)) return { status: 'success' }
 if (recorded) return { status: 'error', phase: recorded.phase, message: recorded.message }
 return { status: 'interrupted' }
}

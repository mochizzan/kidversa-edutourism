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

/**
 * Absent row status (Perbaikan-3) reuses the SAME "Belum Ada Laporan" tag —
 * user-approved, deliberately no new locale key. Absence = an EXPLICIT
 * attendance row with is_present=false; generation for absent participants is
 * blocked server-side (per-participant exclusion, participant_absent when all
 * targets are absent). Unmarked participants are NOT absent.
 */
export const ABSENT_LABEL = NO_REPORT_LABEL
export const ABSENT_BADGE: ReportStatusBadge = NO_REPORT_BADGE

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
 /** Server skip code for the mission phase (mission_bank_empty, …). */
 missionSkipReason?: string
 /** Server skip code for the narrative phase (no_assessments, …). */
 narrativeSkipReason?: string
}

/** Observed per-item failure that outlived the registry (registry loss). */
export interface RecordedGenerateError {
 message: string
 phase?: ReportGeneratePhase
}

/**
 * Terminal per-item SKIP captured from active_generate items — the
 * registry-loss bridge for skips (mirrors RecordedGenerateError). The server
 * declared the row's outcome either a full skip or a success with a phase
 * skipped; nothing persisted proves it (a skip generates no evidence), so the
 * record is what keeps the verdict visible — and truthful — once the registry
 * vanishes, instead of degrading to 'interrupted' or a silent re-ready row.
 */
export interface RecordedGenerateSkip {
 /** The server's terminal verdict for this item. */
 status: 'skipped' | 'success'
 missionSkipReason?: string
 narrativeSkipReason?: string
}

/** i18n keys for the generate row statuses (live items and registry-gone verdicts). */
export const GENERATE_ROW_LABEL = {
 queued: 'admin.status.queued',
 processing: 'admin.status.processing',
 success: 'admin.status.completed',
 error: 'admin.status.error',
 interrupted: 'admin.status.interrupted',
 skipped: 'admin.status.skipped',
} as const satisfies Record<GenerateRowStatus, string>

/**
 * i18n keys for the server's per-phase skip codes (active_generate items).
 * Unknown codes resolve to null at the call site so the raw server code is
 * rendered instead — a declared skip is never dropped silently.
 */
export const GENERATE_SKIP_REASON_LABEL = {
 mission_bank_empty: 'admin.status.missionSkipBankEmpty',
 no_assessments: 'admin.status.narrativeSkipNoAssessments',
} as const satisfies Record<string, string>

export type GenerateSkipReasonCode = keyof typeof GENERATE_SKIP_REASON_LABEL

/** i18n key for a known skip code; null for an unknown one (render raw). */
export const generateSkipReasonLabel = (reason: string) =>
 reason in GENERATE_SKIP_REASON_LABEL
  ? GENERATE_SKIP_REASON_LABEL[reason as GenerateSkipReasonCode]
  : null

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
 /** reportID → per-item skip verdict captured from active_generate items. */
 recordedSkips?: ReadonlyMap<string, RecordedGenerateSkip>
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
 * a recorded failure → 'error' with its message, a recorded server-declared
 * skip → its own verdict ('skipped' / 'success' with the phase skip reasons),
 * otherwise 'interrupted' (never a fake "done", never a silent skip). Rows
 * outside every observed run report null so the caller renders the existing
 * persisted-status UI unchanged.
 *
 * Depends only on (report id, entity evidence, server extras, watch/error/
 * skip sets derived from those extras) — identical inputs always yield
 * identical output, which is what makes a reload rebuild the same state.
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
  // Skip reasons ride along with whatever the terminal status is, so a
  // partial skip (success + reason) renders BOTH facts on the row.
  const skipReasons = {
   missionSkipReason: item.mission_skip_reason,
   narrativeSkipReason: item.narrative_skip_reason,
  }
  if (item.status === 'error')
   return { status: 'error', phase: item.phase, message: item.error, ...skipReasons }
  return item.phase
   ? { status: item.status, phase: item.phase, ...skipReasons }
   : { status: item.status, ...skipReasons }
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
 const skip = flags.recordedSkips?.get(reportId)
 if (!watched && !recorded && !skip) return null
 if (generateEvidenceComplete(report)) return { status: 'success' }
 if (recorded) return { status: 'error', phase: recorded.phase, message: recorded.message }
 if (skip) return { ...skip }
 return { status: 'interrupted' }
}

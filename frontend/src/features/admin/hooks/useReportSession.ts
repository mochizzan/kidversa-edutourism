import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { sessionService } from '../../../core/services/sessions'
import { reportService } from '../../../core/services/reports'
import { assessmentService } from '../../../core/services/assessments'
import { attendanceService } from '../../../core/services/attendance'
import { programService } from '../../../core/services/programs'
import { i18n } from '../../../core/i18n'
import { isSendableReportStatus } from '../../../core/constants/reportStatus'
import type { RecordedGenerateError, RecordedGenerateSkip } from '../../../core/constants/reportStatus'
import { ReportStatus } from '../../../core/types/enums'
import { ApiError } from '../../../core/services/backend-client'
import { useToastStore } from '../../../core/stores/toastStore'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import type { Session, Report, Participant, ProgramStage, Assessment } from '../../../core/types'
import type {
 ReportGenerateOperation,
 ReportSendOperation,
 ReportSessionExtras,
} from '../../../core/services/types'

export type ParticipantReportStatus =
 | 'has_report'
 | 'no_assessment'
 | 'ready_to_generate'
 | 'incomplete'
 | 'absent'

/** Outcome of a Send All run: counts drive the success/partial toast. */
export interface SendAllResult {
 sent: number
 failed: number
}

export interface ReportListItem {
 participant: Participant
 topicId: string
 report: Report | null
 avgRating: number
 assessmentCount: number
 status: ParticipantReportStatus
}

export interface TopicTab {
 programStageId: string
 name: string
}

const STATUS_ORDER: Record<ParticipantReportStatus, number> = {
 absent: 0,
 has_report: 1,
 ready_to_generate: 2,
 no_assessment: 3,
 incomplete: 4,
}

/** Poll cadence while a server-side operation (active_generate/active_send) runs. */
const POLL_INTERVAL_MS = 2000

/**
 * Generate-run completion evidence per watched report: the run persisted the
 * narrative draft AND either persisted its missions (mission_ids), recorded a
 * terminal per-item failure in active_generate (captured message), or the
 * server declared a terminal per-item SKIP (captured verdict — a skip
 * generates no persisted evidence by definition, so without this check every
 * run ending in explicit skips would be reported as an interruption). The
 * worklist of active_generate is exactly the reports whose draft was EMPTY at
 * enqueue, and the run persists every draft before it ends — so a watched id
 * missing a draft or mission evidence when the flag vanishes is a server-side
 * stop (restart / registry loss), never a silent "done".
 */
function generateSettled(
 watched: string[],
 items: Report[],
 recordedErrors: ReadonlyMap<string, RecordedGenerateError>,
 recordedSkips: ReadonlyMap<string, RecordedGenerateSkip>,
): boolean {
 const byId = new Map(items.map((r) => [r.id, r]))
 return watched.every((id) => {
  if (recordedSkips.has(id)) return true // server-declared terminal skip counts as settled
  const r = byId.get(id)
  const draft = typeof r?.ai_narrative_draft === 'string' && r.ai_narrative_draft.length > 0
  if (!draft) return false
  if (recordedErrors.has(id)) return true // terminal recorded failure counts as settled
  return Array.isArray(r?.mission_ids) && r.mission_ids.length > 0
 })
}

/**
 * Send-run completion evidence: every send attempt persists SENT (gateway
 * accepted) or SEND_FAILED (retryable) before the run releases the row. All
 * watched ids terminal ⇒ completed; a watched id still APPROVED/DRAFT when
 * active_send vanishes ⇒ the delivery died with the server mid-run.
 */
function sendSettled(watched: string[], items: Report[]): boolean {
 const byId = new Map<string, Report>(items.map((r) => [r.id, r]))
 return watched.every((id) => {
  const status = byId.get(id)?.status
  return status === ReportStatus.SENT || status === ReportStatus.SEND_FAILED
 })
}

/**
 * Static join inputs captured by the initial load so a poll tick can rebuild
 * the (participant × topic) row grid from fresh report entities alone —
 * participants/assessments/topics/attendance never change while an operation
 * runs.
 */
interface ReportJoinInputs {
 participants: Participant[]
 assessments: Assessment[]
 topicTabs: TopicTab[]
 topicSubIds: Map<string, Set<string>>
 /** Participants with an EXPLICIT attendance row is_present=false (absent). */
 absentIds: ReadonlySet<string>
}

/**
 * Pure row builder — same grid as the initial load, fed fresh report entities.
 * Exported for unit tests.
 *
 * Status precedence: `absent` is UNCONDITIONAL and outranks everything,
 * including `has_report` — a later-absentee with a pre-existing report still
 * shows the absent tag (the report badge next to it remains from the persisted
 * entity), while generation for that participant stays blocked server-side.
 * `absent` requires an EXPLICIT attendance row with is_present=false; an
 * unmarked participant (no row) keeps its normal statuses.
 */
export function buildReportListItems(
 rawReports: Report[],
 inputs: ReportJoinInputs,
): ReportListItem[] {
 const items: ReportListItem[] = []
 for (const p of inputs.participants) {
  const partReports = rawReports.filter((r) => r.participant_id === p.id)
  for (const tab of inputs.topicTabs) {
   const report =
    partReports.find((r) => (r.program_stage_id || '') === tab.programStageId) ?? null
   const subIds = inputs.topicSubIds.get(tab.programStageId) ?? new Set<string>()
   const topicAssessments = inputs.assessments.filter(
    (a) => a.participant_id === p.id && subIds.has(a.session_substage_id),
   )
   const assessmentCount = topicAssessments.length
   const avgRating =
    assessmentCount > 0
     ? topicAssessments.reduce((sum, a) => sum + a.star_rating, 0) / assessmentCount
     : 0

   let status: ParticipantReportStatus
   if (inputs.absentIds.has(p.id)) {
    status = 'absent'
   } else if (report && assessmentCount > 0) {
    status = 'has_report'
   } else if (report && assessmentCount === 0) {
    status = 'no_assessment'
   } else if (!report && assessmentCount > 0) {
    status = 'ready_to_generate'
   } else {
    status = 'incomplete'
   }
   items.push({ participant: p, topicId: tab.programStageId, report, avgRating, assessmentCount, status })
  }
 }
 items.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
 return items
}

/**
 * Declares the `queue` for one send request: the latest server queue when
 * known (refreshed from active_send.queued_ids), otherwise this run's
 * remaining targets — always minus rows this run already finished (a stale
 * snapshot must never resurrect a completed row) and always including the
 * current target, per the POST /api/reports/:id/send contract.
 */
function buildSendQueue(
 reportId: string,
 targets: ReportListItem[],
 finished: Set<string>,
 latest: ReportSendOperation | null,
): string[] {
 const queue = new Set<string>()
 if (latest) {
  for (const id of latest.queued_ids) queue.add(id)
 } else {
  for (const t of targets) if (t.report?.id) queue.add(t.report.id)
 }
 for (const id of finished) queue.delete(id)
 queue.add(reportId)
 return [...queue]
}

export function useReportSession(sessionId: string | undefined) {
 const [session, setSession] = useState<Session | null>(null)
 const [topics, setTopics] = useState<TopicTab[]>([])
 const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
 const [reports, setReports] = useState<ReportListItem[]>([])
 const [participants, setParticipants] = useState<Participant[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [search, setSearch] = useState('')
 const [generating, setGenerating] = useState(false)
 const [sending, setSending] = useState(false)
 const [genError, setGenError] = useState<string | null>(null)
 // Per-report Send All failures (one line each); null when the last run was clean.
 const [sendError, setSendError] = useState<string | null>(null)
 // Server-side operation registries (authoritative while present; omitempty).
 const [activeGenerate, setActiveGenerate] = useState<ReportGenerateOperation | null>(null)
 const [activeSend, setActiveSend] = useState<ReportSendOperation | null>(null)

 const generatingRef = useRef(false)
 const joinInputsRef = useRef<ReportJoinInputs | null>(null)
 const activeGenerateRef = useRef<ReportGenerateOperation | null>(null)
 const activeSendRef = useRef<ReportSendOperation | null>(null)
 const sendLoopRef = useRef(false)
 const pollBusyRef = useRef(false)
 const resumeAttemptedRef = useRef(false)
 // Report ids behind the last observed active_generate / active_send. A flag
 // going watched-non-empty → empty WITHOUT persisted completion evidence is a
 // server-side interruption (restart / registry loss), never a silent "done".
 const prevGenIdsRef = useRef<string[]>([])
 const prevSendIdsRef = useRef<string[]>([])
 // Every report id ever observed in an active_generate run this page session,
 // plus the per-item failure messages captured from its items. Both are rebuilt
 // from GET /api/reports extras on mount (never persisted locally): they only
 // bridge registry loss so a vanished run resolves to success (evidence
 // complete) / error (recorded message) / interrupted (evidence missing).
 const genWatchRef = useRef<Set<string>>(new Set())
 const genErrorsRef = useRef<Map<string, RecordedGenerateError>>(new Map())
 // Per-item SKIP verdicts captured from active_generate items — the
 // registry-loss bridge for skips (same lifecycle as genErrorsRef: server
 // data only, rebuilt from extras on mount). Keeps an explicit skip visible
 // as a skip after the registry vanishes, instead of a false 'interrupted'.
 const genSkipsRef = useRef<Map<string, RecordedGenerateSkip>>(new Map())
 // True once the local generate POST was accepted (202) but the local
 // `generating` bridge has not yet been retired by an authoritative fetch
 // (one that STARTED after the acceptance, or one that observes the run).
 // The bridge exists only to keep the poll interval alive until then — the
 // server extras own every visible status.
 const genAcceptedRef = useRef(false)
 // Set when a local generate POST already surfaced its failure via genError,
 // so the ensuing flag-clear is not double-reported as an interruption.
 const localGenFailedRef = useRef(false)
 // Set when the reports endpoint 404s: polling must stop (no error-loop)
 // until a foreground loadData (mount / Retry) re-arms it.
 const endpointGoneRef = useRef(false)
 const { addToast } = useGlobalToast()

 /** Applies server operation flags to state AND to the refs the loops read. */
 const applyExtras = useCallback((extras: ReportSessionExtras | null | undefined) => {
  const gen = extras?.active_generate ?? null
  const send = extras?.active_send ?? null
  if (gen) {
   // Track the run membership + per-item failures this fetch observed. The
   // sets grow from server data only, so a remount starts empty and rebuilds
   // them from the same extras (identical state after a reload).
   for (const id of gen.queued_ids) genWatchRef.current.add(id)
   for (const id of gen.processing_ids) genWatchRef.current.add(id)
   for (const item of gen.items) {
    genWatchRef.current.add(item.report_id)
    if (item.status === 'error') {
     genErrorsRef.current.set(item.report_id, {
      message: item.error || i18n.t('admin.reports.generateError'),
      phase: item.phase,
     })
     // Latest terminal verdict wins: a failure supersedes an older skip.
     genSkipsRef.current.delete(item.report_id)
    } else if (item.status === 'skipped') {
     genSkipsRef.current.set(item.report_id, {
      status: 'skipped',
      missionSkipReason: item.mission_skip_reason,
      narrativeSkipReason: item.narrative_skip_reason,
     })
     genErrorsRef.current.delete(item.report_id)
    } else if (item.status === 'success') {
     genErrorsRef.current.delete(item.report_id)
     // Partial skip: success with a phase reason present. A clean success
     // clears any stale verdict so a later re-run never inherits it.
     if (item.mission_skip_reason || item.narrative_skip_reason) {
      genSkipsRef.current.set(item.report_id, {
       status: 'success',
       missionSkipReason: item.mission_skip_reason,
       narrativeSkipReason: item.narrative_skip_reason,
      })
     } else {
      genSkipsRef.current.delete(item.report_id)
     }
    } else {
     // queued/processing: outcome pending — drop any stale verdict so a
     // re-run starts from a clean slate.
     genSkipsRef.current.delete(item.report_id)
    }
   }
  }
  activeGenerateRef.current = gen
  activeSendRef.current = send
  if (gen) {
   // The server run is observed → the local `generating` bridge retires; the
   // extras flag now gates the button and keeps polling alive.
   genAcceptedRef.current = false
   setGenerating(false)
  }
  setActiveGenerate(gen)
  setActiveSend(send)
 }, [])

 /**
  * Tracks which operation ids the client is watching across fetches and
  * reports a ONE-SHOT interruption: a watched flag vanished before completion
  * was observed. Completion evidence is persisted truth (drafts for generate,
  * SENT/SEND_FAILED for send); a local generate failure is suppressed because
  * genError already surfaced it. Refs advance on EVERY call, so a transition
  * can only be reported once — later fetches see an empty watch list.
  */
 const noteExtras = useCallback(
  (extras: ReportSessionExtras | null | undefined, freshItems?: Report[]): boolean => {
   const gen = extras?.active_generate ?? null
   const send = extras?.active_send ?? null
   const genIds = gen ? [...gen.queued_ids, ...gen.processing_ids] : []
   const sendIds = send ? [...send.queued_ids, ...send.sending_ids] : []
   let interrupted = false

   if (genIds.length > 0) {
    // A live generate makes any stale local-failure flag obsolete.
    localGenFailedRef.current = false
   } else if (prevGenIdsRef.current.length > 0) {
    const locallyHandled = localGenFailedRef.current || generatingRef.current
    localGenFailedRef.current = false
    if (!locallyHandled && freshItems && !generateSettled(prevGenIdsRef.current, freshItems, genErrorsRef.current, genSkipsRef.current)) {
     interrupted = true
    }
   }

   if (prevSendIdsRef.current.length > 0 && sendIds.length === 0) {
    if (freshItems && !sendSettled(prevSendIdsRef.current, freshItems)) {
     interrupted = true
    }
   }

   prevGenIdsRef.current = genIds
   prevSendIdsRef.current = sendIds
   return interrupted
  },
  [],
 )

 /**
  * Reports-only refetch: entities + operation flags. Never touches the
  * loading skeleton; on failure it keeps the last known state and surfaces
  * the error (toast + console.warn) instead of dying silently. HTTP 404
  * (session/report gone) stops polling entirely: flags cleared, endpoint
  * disarmed until a foreground retry, error shown once through the existing
  * ErrorState — never an error-loop against a dead endpoint.
  */
 const refreshReports = useCallback(async (): Promise<boolean> => {
  if (!sessionId) return false
  if (endpointGoneRef.current) return false // dead endpoint: no error-loop
  // A fetch that only STARTED after the generate POST was accepted is
  // authoritative: the run was registered before the 202 returned, so if its
  // response carries no active_generate, the run is already over — the local
  // `generating` bridge may retire (polling then follows the server flags,
  // or stops when there is genuinely nothing left to poll for).
  const startedAfterAccept = genAcceptedRef.current
  try {
   const bundle = await reportService.getBySession(sessionId)
   const interrupted = noteExtras(bundle.extras, bundle.items)
   const inputs = joinInputsRef.current
   if (inputs) setReports(buildReportListItems(bundle.items, inputs))
   applyExtras(bundle.extras)
   if (startedAfterAccept && !bundle.extras?.active_generate) {
    genAcceptedRef.current = false
    setGenerating(false)
   }
   if (interrupted) {
    // Watched operation vanished without persisted completion evidence —
    // one-shot notice + refetch (watch refs already advanced → no loop).
    useToastStore.getState().addToast({
     type: 'warning',
     message: i18n.t('admin.status.operationInterrupted'),
    })
    void refreshReports()
   }
   return true
  } catch (err) {
   if (err instanceof ApiError && err.status === 404) {
    endpointGoneRef.current = true
    console.warn('[useReportSession] reports endpoint returned 404; stopping operation polling', err)
    prevGenIdsRef.current = []
    prevSendIdsRef.current = []
    applyExtras(null)
    setError(i18n.t('admin.reports.loadDataError'))
    return false
   }
   console.warn('[useReportSession] reports refresh failed; keeping last known state', err)
   // Transient poll failure while a server run (or the local accepted bridge)
   // is in flight is a reconnecting poll tick, NOT a dead run: keep polling
   // and surface a neutral reconnecting notice. A hard failure with no run in
   // flight keeps the existing load-data error. The one-shot
   // operationInterrupted warning (noteExtras path above) stays reserved for
   // a watched run that vanished without persisted evidence (registry loss).
   const runInFlight =
    activeGenerateRef.current !== null ||
    activeSendRef.current !== null ||
    genAcceptedRef.current ||
    generatingRef.current
   useToastStore.getState().addToast({
    type: runInFlight ? 'info' : 'error',
    message: i18n.t(runInFlight ? 'admin.reports.reconnecting' : 'admin.reports.loadDataError'),
   })
   return false
  }
 }, [sessionId, applyExtras, noteExtras])

 const loadData = useCallback(async () => {
  if (!sessionId) return
  endpointGoneRef.current = false // foreground (re)load re-arms the poll
  setLoading(true)
  setError(null)
  try {
   const [sess, sessParticipants, sessAssessments, sessReports, sessStages, sessAttendance] = await Promise.all([
    sessionService.getById(sessionId),
    sessionService.getParticipants(sessionId),
    assessmentService.getBySession(sessionId),
    reportService.getBySession(sessionId),
    sessionService.getStages(sessionId),
    // Attendance drives the absent marking (fatal on failure, like the other inputs).
    attendanceService.getBySession(sessionId),
   ])

   if (!sess) {
    setError(i18n.t('admin.reports.sessionNotFound'))
    setLoading(false)
    return
   }

   setSession(sess)
   setParticipants(sessParticipants)

   const programStages: ProgramStage[] = await programService.getStages(sess.program_id)
   const nameById = new Map(programStages.map((ps) => [ps.id, ps.name]))

   const topicTabs: TopicTab[] = sessStages
    .map((ss) => ({ programStageId: ss.program_stage_id, name: nameById.get(ss.program_stage_id) ?? i18n.t('admin.col.topic') }))
    .filter((t, i, arr) => arr.findIndex((x) => x.programStageId === t.programStageId) === i)
   setTopics(topicTabs)
   setActiveTopicId((prev) => (prev && topicTabs.some((t) => t.programStageId === prev) ? prev : (topicTabs[0]?.programStageId ?? null)))

   // Build a per-Topic set of session_substage ids so per-(participant, topic)
   // rows can scope their assessment counts/avg to that Topic only.
   const sessSubstages = await sessionService.getSubstages(sessionId)
   const topicSubIds = new Map<string, Set<string>>()
   for (const tab of topicTabs) {
    const stageIds = new Set(sessStages.filter((ss) => ss.program_stage_id === tab.programStageId).map((ss) => ss.id))
    const subIds = new Set(sessSubstages.filter((s) => stageIds.has(s.session_stage_id)).map((s) => s.id))
    topicSubIds.set(tab.programStageId, subIds)
   }

   // Static join inputs stay available so later poll ticks can rebuild rows
   // from a reports-only refetch (no loading skeleton during operations).
   // Absence = EXPLICIT row is_present=false; participants without a row are
   // unmarked and stay out of absentIds.
   const absentIds = new Set<string>()
   for (const a of sessAttendance) {
    if (!a.is_present) absentIds.add(a.participant_id)
   }
   const inputs: ReportJoinInputs = {
    participants: sessParticipants,
    assessments: sessAssessments,
    topicTabs,
    topicSubIds,
    absentIds,
   }
   joinInputsRef.current = inputs

   setReports(buildReportListItems(sessReports.items, inputs))
   applyExtras(sessReports.extras)
   if (noteExtras(sessReports.extras, sessReports.items)) {
    // Watched operation vanished before completion was observed (e.g. a
    // restart while an earlier attempt was in flight) — one-shot notice +
    // refetch; watch refs already advanced, so this cannot repeat.
    useToastStore.getState().addToast({
     type: 'warning',
     message: i18n.t('admin.status.operationInterrupted'),
    })
    void refreshReports()
   }
  } catch (err) {
   if (err instanceof ApiError && err.status === 404) {
    endpointGoneRef.current = true
    console.warn('[useReportSession] reports endpoint returned 404; stopping operation polling', err)
    prevGenIdsRef.current = []
    prevSendIdsRef.current = []
    applyExtras(null)
   }
   setError(i18n.t('admin.reports.loadDataError'))
  } finally {
   setLoading(false)
  }
 }, [sessionId, applyExtras, noteExtras, refreshReports])

 useEffect(() => {
  loadData()
 }, [loadData])

 /** One poll tick: refetch, keep last known state on failure, next tick retries. */
 const pollTick = useCallback(async () => {
  if (pollBusyRef.current) return // never pile up overlapping ticks
  pollBusyRef.current = true
  try {
   await refreshReports()
  } finally {
   pollBusyRef.current = false
  }
 }, [refreshReports])

 // ONE interval, active only while a server operation is running or a local
 // run is in flight (optimistic bridge until the first server observation).
 // Always cleared on unmount or when both flags are absent.
 const operationsActive = activeGenerate !== null || activeSend !== null
 const shouldPoll = operationsActive || generating || sending
 useEffect(() => {
  if (!sessionId || !shouldPoll) return
  const timer = setInterval(() => {
   void pollTick()
  }, POLL_INTERVAL_MS)
  return () => clearInterval(timer)
 }, [sessionId, shouldPoll, pollTick])

 /**
  * Shared sequential Send All loop (local run AND server-queue resume).
  * Business logic (one WhatsApp send per row, failure recording, result
  * toast) is unchanged; the additions are server-run awareness:
  *  - every send declares `queue` (remaining incl. current, refreshed),
  *  - rows the latest poll shows finished/in-flight are skipped,
  *  - HTTP 409 `send_in_progress` counts as "processing" (log, continue),
  *  - an immediate refetch runs after the loop ends.
  */
 const runSendLoop = useCallback(
  async (targets: ReportListItem[]): Promise<SendAllResult> => {
   sendLoopRef.current = true // single-flight: guards resume vs local loop
   setSending(true)
   setSendError(null)
   let sent = 0
   const failures: string[] = []
   // Rows this run finished (success OR definitive failure) — never re-declared.
   const finished = new Set<string>()
   let result: SendAllResult
   try {
    for (const r of targets) {
     const reportId = r.report?.id
     if (!reportId || finished.has(reportId)) continue
     const latest = activeSendRef.current
     if (latest) {
      // Skip rows the latest poll shows already done (no longer queued) …
      if (!latest.queued_ids.includes(reportId)) {
       finished.add(reportId)
       continue
      }
      // … or currently in flight elsewhere (server is the source of truth).
      if (latest.sending_ids.includes(reportId)) {
       console.warn(
        '[useReportSession] report already in flight on server, skipping this pass',
        reportId,
       )
       continue
      }
     }
     try {
      // Backend delivers the WhatsApp message and only then marks SENT;
      // a throw means it recorded SEND_FAILED (retryable).
      await reportService.send(
       reportId,
       undefined,
       buildSendQueue(reportId, targets, finished, latest),
      )
      sent++
      finished.add(reportId)
     } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'send_in_progress') {
       // In flight on the server: treat as processing, not a failure.
       // Not marked finished — a later pass retries naturally.
       console.warn(
        '[useReportSession] send_in_progress; treated as processing for report',
        reportId,
       )
       continue
      }
      finished.add(reportId)
      const reason =
       err instanceof ApiError && err.status === 403 && err.code === 'session_not_active'
        ? i18n.t('admin.reports.sessionInactiveError')
        : err instanceof Error && err.message
         ? err.message
         : i18n.t('admin.reports.sendListError')
      failures.push(`${r.participant.child_name}: ${reason}`)
     }
    }
    if (failures.length > 0) setSendError(failures.join('\n'))
    addToast({
     type: failures.length > 0 ? 'error' : 'success',
     message: i18n.t('admin.reports.sendAllResult', { sent, failed: failures.length }),
    })
    result = { sent, failed: failures.length }
   } finally {
    // Release the single-flight BEFORE the refetch so a leftover server
    // queue may trigger one resume pass (409 rows) while a drained queue
    // just clears the flags.
    sendLoopRef.current = false
    setSending(false)
   }
   await refreshReports() // immediate refetch when the loop ends
   return result
  },
  [addToast, refreshReports],
 )

 const handleSendAll = useCallback(
  async (mode: 'send' | 'resend'): Promise<SendAllResult> => {
   if (!sessionId) return { sent: 0, failed: 0 }
   if (sendLoopRef.current) return { sent: 0, failed: 0 } // no double-run
   // Active Topic only. Plain send targets APPROVED + SEND_FAILED (each
   // attempt mints a fresh parent token, so retrying is idempotent);
   // resend additionally re-delivers reports already SENT.
   const targets = reports.filter((r) => {
    if (r.topicId !== activeTopicId || !r.report) return false
    return mode === 'resend'
     ? isSendableReportStatus(r.report.status) || r.report.status === ReportStatus.SENT
     : isSendableReportStatus(r.report.status)
   })
   return runSendLoop(targets)
  },
  [sessionId, reports, activeTopicId, runSendLoop],
 )

 // Resume: on mount (or any fresh observation) with active_send present and
 // no local loop running, continue the loop for the server-queued rows —
 // this is what makes an in-flight run survive page navigation and browser
 // close. One resume pass per server run (reset only when the flag clears),
 // so a queue the server never drains can never loop forever.
 useEffect(() => {
  if (!activeSend) {
   resumeAttemptedRef.current = false
   return
  }
  if (sendLoopRef.current) return // local loop owns the run
  if (resumeAttemptedRef.current) return
  if (!joinInputsRef.current) return
  resumeAttemptedRef.current = true
  const targets = reports.filter(
   (r) => r.report && activeSend.queued_ids.includes(r.report.id),
  )
  if (targets.length === 0) return
  void runSendLoop(targets)
 }, [activeSend, reports, runSendLoop])

 const handleGenerateAll = useCallback(async (): Promise<{
  ok: boolean
  generatedCount: number
  skippedParticipants: Participant[]
 }> => {
  if (generatingRef.current || activeGenerateRef.current) {
   // Already running (locally or observed on the server) — never re-fire.
   return { ok: false, generatedCount: 0, skippedParticipants: [] }
  }
  generatingRef.current = true
  if (!sessionId) {
   generatingRef.current = false
   return { ok: false, generatedCount: 0, skippedParticipants: [] }
  }
  setGenError(null)

  // Active Topic only (mirrors handleSendAll): eligibility, the skipped set
  // and the POST scope all follow the topic filter — 1 topic = 1 report run,
  // never a cross-topic generate.
  const topicScoped = reports.filter((r) => r.topicId === activeTopicId)
  const eligible = topicScoped.filter((r) => r.status === 'ready_to_generate')
  // Absent rows join the skipped set: they can never be generated (the server
  // excludes them), so the result toast must list them with the others.
  const skipped = topicScoped
   .filter((r) => r.status === 'incomplete' || r.status === 'no_assessment' || r.status === 'absent')
   .map((r) => r.participant)

  if (eligible.length === 0) {
   generatingRef.current = false
   setGenError(i18n.t('admin.reports.eligibleEmptyError'))
   return { ok: false, generatedCount: 0, skippedParticipants: skipped }
  }

  // The local flag only gates the button and keeps the poll interval alive
  // until the accepted run is observed — every visible row status comes from
  // the server's active_generate extras.
  setGenerating(true)
  try {
   // topic_id scopes the server run to the active topic; with no active topic
   // the field is omitted and the server keeps legacy all-topics behavior.
   await reportService.generate(sessionId, activeTopicId ?? undefined) // 202 — the run continues server-side
  } catch (e) {
   // Failure surfaced via genError below — suppress the matching flag-clear
   // interruption notice (noteExtras consumes this on the next fetch).
   localGenFailedRef.current = true
   // 409 already_generating = another run owns the session: name it as such
   // and refetch so the poll attaches to the live run instead of idling.
   // The existing errors.already_generating locale string carries the message.
   if (e instanceof ApiError && e.status === 409) {
    setGenError(i18n.t('errors.already_generating'))
    // A live run may exist server-side — refetch so the poll attaches to it.
    void refreshReports()
   } else if (e instanceof ApiError && e.status === 403 && e.code === 'session_not_active') {
    setGenError(i18n.t('admin.reports.sessionInactiveError'))
    void refreshReports()
   } else {
    setGenError(e instanceof Error ? e.message : i18n.t('admin.reports.generateError'))
   }
   generatingRef.current = false
   setGenerating(false)
   genAcceptedRef.current = false
   return { ok: false, generatedCount: 0, skippedParticipants: skipped }
  }
  // Accepted: the run is registered before the 202, so polling starts right
  // away and the first authoritative fetch retires the local bridge (see
  // refreshReports/applyExtras). If this refetch fails, the bridge keeps the
  // interval polling until one succeeds.
  genAcceptedRef.current = true
  await refreshReports()
  generatingRef.current = false
  return { ok: true, generatedCount: eligible.length, skippedParticipants: skipped }
 }, [sessionId, reports, activeTopicId, refreshReports])

 const handleGenerateOne = useCallback(async (participantId: string): Promise<boolean> => {
  if (generatingRef.current || activeGenerateRef.current) return false
  generatingRef.current = true
  if (!sessionId) {
   generatingRef.current = false
   return false
  }
  setGenError(null)
  setGenerating(true) // button/poll bridge only; server extras own the status
  try {
   await reportService.generateOne(sessionId, participantId) // 202
  } catch (e) {
   // Failure surfaced via genError below — suppress the matching flag-clear
   // interruption notice (noteExtras consumes this on the next fetch).
   localGenFailedRef.current = true
   if (e instanceof ApiError && e.status === 403 && e.code === 'session_not_active') {
    setGenError(i18n.t('admin.reports.sessionInactiveError'))
   } else {
    setGenError(e instanceof Error ? e.message : i18n.t('admin.reports.generateError'))
   }
   generatingRef.current = false
   setGenerating(false)
   genAcceptedRef.current = false
   return false
  }
  genAcceptedRef.current = true
  await refreshReports() // immediate refetch of server truth
  generatingRef.current = false
  return true
 }, [sessionId, refreshReports])

 const filteredReports = useMemo(() => {
  if (!search) return reports
  const q = search.toLowerCase()
  return reports.filter(
   (r) =>
    r.participant.child_name.toLowerCase().includes(q) ||
    r.participant.school_name?.toLowerCase().includes(q),
  )
 }, [reports, search])

 return {
  session,
  topics,
  activeTopicId,
  setActiveTopicId,
  reports,
  participants,
  loading,
  error,
  search,
  setSearch,
  generating,
  sending,
  genError,
  sendError,
  activeGenerate,
  activeSend,
  generateWatch: genWatchRef.current,
  generateErrors: genErrorsRef.current,
  generateSkips: genSkipsRef.current,
  filteredReports,
  loadData,
  handleGenerateAll,
  handleGenerateOne,
  handleSendAll,
 }
}

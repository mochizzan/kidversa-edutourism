import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { sessionService } from '../../../core/services/sessions'
import { reportService } from '../../../core/services/reports'
import { assessmentService } from '../../../core/services/assessments'
import { programService } from '../../../core/services/programs'
import { i18n } from '../../../core/i18n'
import { isSendableReportStatus } from '../../../core/constants/reportStatus'
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
 has_report: 0,
 ready_to_generate: 1,
 no_assessment: 2,
 incomplete: 3,
}

/** Poll cadence while a server-side operation (active_generate/active_send) runs. */
const POLL_INTERVAL_MS = 2000

/**
 * Generate-run completion evidence: the worklist of active_generate is exactly
 * the reports whose narrative draft was EMPTY at enqueue, and the run persists
 * every draft before it ends. All watched ids carrying a draft ⇒ the run
 * finished; a watched id still draft-less when the flag vanishes ⇒ the server
 * stopped mid-run (restart) or the run errored before persisting.
 */
function generateSettled(watched: string[], items: Report[]): boolean {
 const byId = new Map<string, Report>(items.map((r) => [r.id, r]))
 return watched.every((id) => {
  const draft = byId.get(id)?.ai_narrative_draft
  return typeof draft === 'string' && draft.length > 0
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
 * participants/assessments/topics never change while an operation runs.
 */
interface ReportJoinInputs {
 participants: Participant[]
 assessments: Assessment[]
 topicTabs: TopicTab[]
 topicSubIds: Map<string, Set<string>>
}

/** Pure row builder — same grid as the initial load, fed fresh report entities. */
function buildReportListItems(
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
   if (report && assessmentCount > 0) {
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
  activeGenerateRef.current = gen
  activeSendRef.current = send
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
    if (!locallyHandled && freshItems && !generateSettled(prevGenIdsRef.current, freshItems)) {
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
  try {
   const bundle = await reportService.getBySession(sessionId)
   const interrupted = noteExtras(bundle.extras, bundle.items)
   const inputs = joinInputsRef.current
   if (inputs) setReports(buildReportListItems(bundle.items, inputs))
   applyExtras(bundle.extras)
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
   useToastStore.getState().addToast({
    type: 'error',
    message: i18n.t('admin.reports.loadDataError'),
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
   const [sess, sessParticipants, sessAssessments, sessReports, sessStages] = await Promise.all([
    sessionService.getById(sessionId),
    sessionService.getParticipants(sessionId),
    assessmentService.getBySession(sessionId),
    reportService.getBySession(sessionId),
    sessionService.getStages(sessionId),
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
   const inputs: ReportJoinInputs = {
    participants: sessParticipants,
    assessments: sessAssessments,
    topicTabs,
    topicSubIds,
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
       err instanceof Error && err.message
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

  const eligible = reports.filter((r) => r.status === 'ready_to_generate')
  const skipped = reports
   .filter((r) => r.status === 'incomplete' || r.status === 'no_assessment')
   .map((r) => r.participant)

  if (eligible.length === 0) {
   setGenError(i18n.t('admin.reports.eligibleEmptyError'))
   return { ok: false, generatedCount: 0, skippedParticipants: skipped }
  }

  setGenerating(true) // optimistic overlay; server active_generate wins
  try {
   await reportService.generate(sessionId) // blocking POST — unchanged
   await refreshReports() // immediate refetch of server truth
   return { ok: true, generatedCount: eligible.length, skippedParticipants: skipped }
  } catch (e) {
   // Failure surfaced via genError below — suppress the matching flag-clear
   // interruption notice (noteExtras consumes this on the next fetch).
   localGenFailedRef.current = true
   setGenError(e instanceof Error ? e.message : i18n.t('admin.reports.generateError'))
   return { ok: false, generatedCount: 0, skippedParticipants: skipped }
  } finally {
   generatingRef.current = false
   setGenerating(false)
  }
 }, [sessionId, reports, refreshReports])

 const handleGenerateOne = useCallback(async (participantId: string): Promise<boolean> => {
  if (generatingRef.current || activeGenerateRef.current) return false
  generatingRef.current = true
  if (!sessionId) {
   generatingRef.current = false
   return false
  }
  setGenError(null)
  setGenerating(true) // optimistic overlay; server active_generate wins
  try {
   await reportService.generateOne(sessionId, participantId)
   await refreshReports() // immediate refetch of server truth
   return true
  } catch (e) {
   // Failure surfaced via genError below — suppress the matching flag-clear
   // interruption notice (noteExtras consumes this on the next fetch).
   localGenFailedRef.current = true
   setGenError(e instanceof Error ? e.message : i18n.t('admin.reports.generateError'))
   return false
  } finally {
   generatingRef.current = false
   setGenerating(false)
  }
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
  filteredReports,
  loadData,
  handleGenerateAll,
  handleGenerateOne,
  handleSendAll,
 }
}

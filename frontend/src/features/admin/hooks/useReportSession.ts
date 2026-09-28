import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { sessionService } from '../../../core/services/sessions'
import { reportService } from '../../../core/services/reports'
import { assessmentService } from '../../../core/services/assessments'
import { programService } from '../../../core/services/programs'
import { i18n } from '../../../core/i18n'
import { isSendableReportStatus } from '../../../core/constants/reportStatus'
import { ReportStatus } from '../../../core/types/enums'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import type { Session, Report, Participant, ProgramStage } from '../../../core/types'

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
  const generatingRef = useRef(false)
  const { addToast } = useGlobalToast()

  const loadData = useCallback(async () => {
    if (!sessionId) return
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

      // Per-(participant, topic) rows. Each participant gets one row per Topic,
      // keyed by (participant_id, program_stage_id). Under the new invariant a
      // report belongs to a single Topic.
      const items: ReportListItem[] = []
      for (const p of sessParticipants) {
        const partReports = sessReports.filter((r) => r.participant_id === p.id)
        for (const tab of topicTabs) {
          const report =
            partReports.find((r) => (r.program_stage_id || '') === tab.programStageId) ?? null
          const subIds = topicSubIds.get(tab.programStageId) ?? new Set<string>()
          const topicAssessments = sessAssessments.filter(
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

      setReports(items)
    } catch {
      setError(i18n.t('admin.reports.loadDataError'))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleGenerateAll = useCallback(async (): Promise<{
    ok: boolean
    generatedCount: number
    skippedParticipants: Participant[]
  }> => {
    if (generatingRef.current) return { ok: false, generatedCount: 0, skippedParticipants: [] }
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

    setGenerating(true)
    try {
      await reportService.generate(sessionId)
      await loadData()
      return { ok: true, generatedCount: eligible.length, skippedParticipants: skipped }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : i18n.t('admin.reports.generateError'))
      return { ok: false, generatedCount: 0, skippedParticipants: skipped }
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }, [sessionId, reports, loadData])

  const handleGenerateOne = useCallback(async (participantId: string): Promise<boolean> => {
    if (generatingRef.current) return false
    generatingRef.current = true
    if (!sessionId) {
      generatingRef.current = false
      return false
    }
    setGenError(null)
    setGenerating(true)
    try {
      await reportService.generateOne(sessionId, participantId)
      await loadData()
      return true
    } catch (e) {
      setGenError(e instanceof Error ? e.message : i18n.t('admin.reports.generateError'))
      return false
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }, [sessionId, loadData])

  const handleSendAll = useCallback(
    async (mode: 'send' | 'resend'): Promise<SendAllResult> => {
      if (!sessionId) return { sent: 0, failed: 0 }
      setSending(true)
      setSendError(null)
      let sent = 0
      const failures: string[] = []
      try {
        // Active Topic only. Plain send targets APPROVED + SEND_FAILED (each
        // attempt mints a fresh parent token, so retrying is idempotent);
        // resend additionally re-delivers reports already SENT.
        const targets = reports.filter((r) => {
          if (r.topicId !== activeTopicId || !r.report) return false
          return mode === 'resend'
            ? isSendableReportStatus(r.report.status) || r.report.status === ReportStatus.SENT
            : isSendableReportStatus(r.report.status)
        })
        for (const r of targets) {
          const reportId = r.report?.id
          if (!reportId) continue
          try {
            // Backend delivers the WhatsApp message and only then marks SENT;
            // a throw means it recorded SEND_FAILED (retryable).
            await reportService.send(reportId)
            sent++
          } catch (err) {
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
        await loadData()
        return { sent, failed: failures.length }
      } finally {
        setSending(false)
      }
    }, [sessionId, reports, activeTopicId, loadData, addToast])

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
    filteredReports,
    loadData,
    handleGenerateAll,
    handleGenerateOne,
    handleSendAll,
  }
}

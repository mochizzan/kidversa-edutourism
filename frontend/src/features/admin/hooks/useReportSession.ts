import { useState, useEffect, useMemo, useCallback } from 'react'
import { sessionService } from '../../../core/services/sessions'
import { reportService } from '../../../core/services/reports'
import { assessmentService } from '../../../core/services/assessments'
import { ReportStatus } from '../../../core/types/enums'
import type { Session, Report, Participant } from '../../../core/types'

export type ParticipantReportStatus =
  | 'has_report'
  | 'no_assessment'
  | 'ready_to_generate'
  | 'incomplete'

export interface ReportListItem {
  participant: Participant
  report: Report | null
  avgRating: number
  assessmentCount: number
  status: ParticipantReportStatus
}

const STATUS_ORDER: Record<ParticipantReportStatus, number> = {
  has_report: 0,
  ready_to_generate: 1,
  no_assessment: 2,
  incomplete: 3,
}

export function useReportSession(sessionId: string | undefined) {
  const [session, setSession] = useState<Session | null>(null)
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      const [sess, sessParticipants, sessAssessments, sessReports] = await Promise.all([
        sessionService.getById(sessionId),
        sessionService.getParticipants(sessionId),
        assessmentService.getBySession(sessionId),
        reportService.getBySession(sessionId),
      ])

      if (!sess) {
        setError('Sesi tidak ditemukan.')
        setLoading(false)
        return
      }

      setSession(sess)
      setParticipants(sessParticipants)

      const reportMap = new Map(sessReports.map((r) => [r.participant_id, r]))

      const items: ReportListItem[] = sessParticipants.map((p) => {
        const report = reportMap.get(p.id) ?? null
        const partAssessments = sessAssessments.filter((a) => a.participant_id === p.id)
        const assessmentCount = partAssessments.length
        const avgRating =
          assessmentCount > 0
            ? partAssessments.reduce((sum, a) => sum + a.star_rating, 0) / assessmentCount
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

        return { participant: p, report, avgRating, assessmentCount, status }
      })

      items.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

      setReports(items)
    } catch {
      setError('Gagal memuat data laporan.')
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
    if (!sessionId) return { ok: false, generatedCount: 0, skippedParticipants: [] }
    setGenError(null)

    const eligible = reports.filter((r) => r.status === 'ready_to_generate')
    const skipped = reports
      .filter((r) => r.status === 'incomplete' || r.status === 'no_assessment')
      .map((r) => r.participant)

    if (eligible.length === 0) {
      setGenError('Tidak ada peserta yang eligible untuk generate laporan.')
      return { ok: false, generatedCount: 0, skippedParticipants: skipped }
    }

    setGenerating(true)
    try {
      await reportService.generate(sessionId)
      await loadData()
      return { ok: true, generatedCount: eligible.length, skippedParticipants: skipped }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Gagal generate laporan.')
      return { ok: false, generatedCount: 0, skippedParticipants: skipped }
    } finally {
      setGenerating(false)
    }
  }, [sessionId, reports, loadData])

  const handleGenerateOne = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false
    setGenError(null)
    setGenerating(true)
    try {
      await reportService.generate(sessionId)
      await loadData()
      return true
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Gagal generate laporan.')
      return false
    } finally {
      setGenerating(false)
    }
  }, [sessionId, loadData])

  const handleSendAll = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false
    setSending(true)
    try {
      const approvedReports = reports.filter((r) => r.report?.status === ReportStatus.APPROVED)
      for (const r of approvedReports) {
        if (r.report) await reportService.send(r.report.id)
      }
      await loadData()
      return true
    } catch {
      setError('Gagal mengirim laporan.')
      return false
    } finally {
      setSending(false)
    }
  }, [sessionId, reports, loadData])

  const filteredReports = useMemo(() => {
    if (!search) return reports
    const q = search.toLowerCase()
    return reports.filter(
      (r) =>
        r.participant.child_name.toLowerCase().includes(q) ||
        r.participant.school_name?.toLowerCase().includes(q),
    )
  }, [reports, search])

  const approvedCount = reports.filter(
    (r) => r.report?.status === ReportStatus.APPROVED,
  ).length

  return {
    session,
    reports,
    participants,
    loading,
    error,
    search,
    setSearch,
    generating,
    sending,
    genError,
    filteredReports,
    approvedCount,
    loadData,
    handleGenerateAll,
    handleGenerateOne,
    handleSendAll,
  }
}

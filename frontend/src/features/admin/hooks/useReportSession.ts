import { useState, useEffect, useMemo, useCallback } from 'react'
import { sessionService } from '../../../core/services/sessions'
import { reportService } from '../../../core/services/reports'
import { assessmentService } from '../../../core/services/assessments'
import { ReportStatus } from '../../../core/types/enums'
import type { Session, Report, Participant, Assessment } from '../../../core/types'

export interface ReportItem {
  report: Report
  participant: Participant
  avgRating: number
}

export function useReportSession(sessionId: string | undefined) {
  const [session, setSession] = useState<Session | null>(null)
  const [reports, setReports] = useState<ReportItem[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [missingParticipants, setMissingParticipants] = useState<Participant[]>([])

  const loadData = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      const [sess, sessParticipants, sessAssessments] = await Promise.all([
        sessionService.getById(sessionId),
        sessionService.getParticipants(sessionId),
        assessmentService.getBySession(sessionId),
      ])

      if (!sess) {
        setError('Sesi tidak ditemukan.')
        setLoading(false)
        return
      }

      setSession(sess)
      setParticipants(sessParticipants)
      setAssessments(sessAssessments)

      const sessReports = await reportService.getBySession(sessionId)
      const items: ReportItem[] = sessReports.map((r) => {
        const participant = sessParticipants.find((p) => p.id === r.participant_id)!
        const partAssessments = sessAssessments.filter((a) => a.participant_id === r.participant_id)
        const avgRating =
          partAssessments.length > 0
            ? partAssessments.reduce((sum, a) => sum + a.star_rating, 0) / partAssessments.length
            : 0
        return { report: r, participant, avgRating }
      })

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

  const validateAssessments = useCallback((): Participant[] => {
    const missing: Participant[] = []
    for (const p of participants) {
      const partAssessments = assessments.filter((a) => a.participant_id === p.id)
      if (partAssessments.length === 0) missing.push(p)
    }
    return missing
  }, [participants, assessments])

  const handleGenerateAll = useCallback(async (): Promise<{ ok: boolean; missingCount: number }> => {
    if (!sessionId) return { ok: false, missingCount: 0 }
    setGenError(null)
    setMissingParticipants([])

    const missing = validateAssessments()
    if (missing.length > 0) {
      setMissingParticipants(missing)
      return { ok: false, missingCount: missing.length }
    }

    setGenerating(true)
    try {
      await reportService.generate(sessionId)
      await loadData()
      return { ok: true, missingCount: 0 }
    } catch {
      setGenError('Gagal generate laporan.')
      return { ok: false, missingCount: 0 }
    } finally {
      setGenerating(false)
    }
  }, [sessionId, validateAssessments, loadData])

  const handleSendAll = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false
    setSending(true)
    try {
      const approvedReports = reports.filter((r) => r.report.status === ReportStatus.APPROVED)
      for (const r of approvedReports) {
        await reportService.send(r.report.id)
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

  const approvedCount = reports.filter((r) => r.report.status === ReportStatus.APPROVED).length

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
    missingParticipants,
    setMissingParticipants,
    filteredReports,
    approvedCount,
    loadData,
    handleGenerateAll,
    handleSendAll,
  }
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { reportService } from '../../../core/services/reports'
import { openSSE } from '../../../core/services/backendClient'
import { API_ROUTES } from '../../../core/constants/apiRoutes'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { photoService } from '../../../core/services/photos'
import { missionService } from '../../../core/services/missions'
import { programService } from '../../../core/services/programs'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { useAuth } from '../../../core/hooks/useAuth'
import { formatDate } from '../../../core/utils'
import {
  DEFAULT_FACILITATOR_MESSAGE,
  DEFAULT_FACILITATOR_NAME,
} from '../../../core/constants/report'
import { generateMiniRaportHTML } from '../../../shared/templates/miniRaport'
import {
  captureRaportAsPdf,
  captureRaportAsBlob,
  downloadBlob,
} from '../../../core/utils/raportCapture'
import { extractFirstSentence } from '../../../core/utils/reportNarrative'
import type {
  Report,
  Participant,
  Session,
  Assessment,
  SmartPhoto,
  ProgramStage,
  MissionBank,
} from '../../../core/types'

export interface StageInfo {
  programStage: ProgramStage
  sessionStageId: string
  assessment?: Assessment
}

export function useReportReview(sessionId: string | undefined, reportId: string | undefined) {
  const { user } = useAuth()
  const { addToast } = useGlobalToast()

  const [report, setReport] = useState<Report | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [photo, setPhoto] = useState<SmartPhoto | null>(null)
  const [stageInfos, setStageInfos] = useState<StageInfo[]>([])
  const [missions, setMissions] = useState<MissionBank[]>([])
  const [assignedMissionIds, setAssignedMissionIds] = useState<string[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [narrativeText, setNarrativeText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [hasNoAssessment, setHasNoAssessment] = useState(false)

  const prevTextRef = useRef('')

  const loadData = useCallback(async () => {
    if (!sessionId || !reportId) return
    setLoading(true)
    setError(null)

    try {
      const [rpt, sess, stageAssessments, sessStages, partPhotos] = await Promise.all([
        reportService.getById(reportId),
        sessionService.getById(sessionId),
        assessmentService.getBySession(sessionId),
        sessionService.getStages(sessionId),
        photoService.getBySession(sessionId),
      ])

      if (!rpt) {
        setError('Laporan tidak ditemukan.')
        setLoading(false)
        return
      }
      if (!sess) {
        setError('Sesi tidak ditemukan.')
        setLoading(false)
        return
      }

      setReport(rpt)
      setSession(sess)
      setNarrativeText(rpt.ai_narrative_final || rpt.ai_narrative_draft || '')

      const participants = await sessionService.getParticipants(sessionId)
      const part = participants.find((p) => p.id === rpt.participant_id) || null
      if (!part) {
        setError('Peserta tidak ditemukan untuk laporan ini.')
        setLoading(false)
        return
      }
      setParticipant(part)

      const partAssessments = stageAssessments.filter((a) => a.participant_id === rpt.participant_id)

      const programStages = await programService.getStages(sess.program_id)
      const builtStageInfos: StageInfo[] = sessStages
        .map((ss) => {
          const pgStage = programStages.find((ps) => ps.id === ss.program_stage_id)
          if (!pgStage) return null
          const assessment = partAssessments.find((a) => a.session_stage_id === ss.id)
          return { programStage: pgStage, sessionStageId: ss.id, assessment } as StageInfo
        })
        .filter((s): s is NonNullable<typeof s> => s !== null) as StageInfo[]
      setStageInfos(builtStageInfos)

      const hasNoAssessment = builtStageInfos.every((si) => !si.assessment)
      setHasNoAssessment(hasNoAssessment)

      const reportPhoto =
        partPhotos.find((p) => p.participant_id === rpt.participant_id && p.is_report_photo) || null
      setPhoto(reportPhoto)

      const missionResult = await missionService.getAll({ limit: 50 })
      const programMissions = missionResult.data.filter((m) => m.program_id === sess.program_id)
      setMissions(programMissions)
      setAssignedMissionIds(rpt.mission_ids || [])
    } catch {
      setError('Gagal memuat data laporan.')
    } finally {
      setLoading(false)
    }
  }, [sessionId, reportId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const toggleMission = useCallback((missionId: string) => {
    setAssignedMissionIds((prev) =>
      prev.includes(missionId) ? prev.filter((id) => id !== missionId) : [...prev, missionId],
    )
  }, [])

  const handleApprove = useCallback(async () => {
    if (!reportId) return
    setActionLoading('approve')
    try {
      await reportService.approve(reportId, {
        narrative_final: narrativeText,
        mission_ids: assignedMissionIds,
      })
      await loadData()
      addToast({ type: 'success', message: 'Laporan berhasil disetujui' })
      return true
    } catch {
      setError('Gagal menyetujui laporan.')
      return false
    } finally {
      setActionLoading(null)
    }
  }, [reportId, narrativeText, assignedMissionIds, loadData, addToast])

  const handleSend = useCallback(async () => {
    if (!reportId) return
    setActionLoading('send')
    try {
      await reportService.send(reportId)
      await loadData()
      addToast({ type: 'success', message: 'Laporan berhasil dikirim ke orang tua' })
      return true
    } catch {
      setError('Gagal mengirim laporan.')
      return false
    } finally {
      setActionLoading(null)
    }
  }, [reportId, loadData, addToast])

  const handleGenerateNarrative = useCallback(async (force = false) => {
    if (!reportId || streaming) return false
    setStreaming(true)
    const prev = narrativeText
    prevTextRef.current = prev
    try {
      // Open SSE first so we don't miss early tokens.
      const source = openSSE(
        API_ROUTES.REPORTS.GENERATE_STREAM_SSE(reportId),
        () => {},
        {
          onError: () => {
            source.close()
            setNarrativeText(prevTextRef.current)
            setStreaming(false)
            addToast({ type: 'error', message: 'Gagal memuat streaming narasi.' })
          },
        },
      )
      source.addEventListener('token', (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data)
          if (typeof parsed.delta === 'string') {
            setNarrativeText((t) => t + parsed.delta)
          }
        } catch { /* ignore malformed */ }
      })
      source.addEventListener('done', (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data)
          if (typeof parsed.full === 'string' && parsed.full) {
            setNarrativeText(parsed.full)
          }
        } catch { /* ignore */ }
        source.close()
        setStreaming(false)
        addToast({ type: 'success', message: 'Narasi berhasil dibuat.' })
      })
      source.addEventListener('error', (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data)
          addToast({ type: 'error', message: parsed.message || 'Gagal membuat narasi.' })
        } catch { /* ignore */ }
        setNarrativeText(prevTextRef.current)
        source.close()
        setStreaming(false)
      })
      await reportService.generateNarrativeStream(reportId, force)
      return true
    } catch {
      setNarrativeText(prevTextRef.current)
      setStreaming(false)
      addToast({ type: 'error', message: 'Gagal memulai pembuatan narasi.' })
      return false
    }
  }, [reportId, narrativeText, addToast, streaming])

  const buildRaportHtml = useCallback((): string | null => {
    if (!participant || !session) return null
    const quote = extractFirstSentence(narrativeText)

    return generateMiniRaportHTML({
      childName: participant.child_name,
      childAge: participant.child_age,
      sessionDate: formatDate(session.session_date),
      photoUrl: photo?.framed_file_url || photo?.original_file_url,
      quote,
      stages: stageInfos.map((si, i) => ({
        name: si.programStage.name,
        sequenceOrder: i + 1,
        starRating: si.assessment?.star_rating ?? 0,
      })),
      narrative: narrativeText,
      facilitatorMessage: DEFAULT_FACILITATOR_MESSAGE,
      missions: missions
        .filter((m) => assignedMissionIds.includes(m.id))
        .map((m) => m.title_child),
      facilitatorName: user?.name || DEFAULT_FACILITATOR_NAME,
      facilitatorPhotoUrl: user?.avatar_url,
    })
  }, [participant, session, narrativeText, photo, stageInfos, missions, assignedMissionIds, user])

  const handleCetak = useCallback(() => {
    const html = buildRaportHtml()
    if (!html) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    setTimeout(() => {
      try {
        if (!win.closed) win.print()
      } catch {
        /* window closed */
      }
    }, 1500)
  }, [buildRaportHtml])

  const handleDownloadPdf = useCallback(async () => {
    if (!participant) return
    setActionLoading('pdf')
    try {
      const html = buildRaportHtml()
      if (!html) return
      await captureRaportAsPdf(html, `raport-${participant.child_name}.pdf`)
    } catch {
      addToast({ type: 'error', message: 'Gagal menghasilkan file PDF.' })
    } finally {
      setActionLoading(null)
    }
  }, [participant, buildRaportHtml, addToast])

  const handleDownloadPng = useCallback(async () => {
    if (!participant) return
    setActionLoading('png')
    try {
      const html = buildRaportHtml()
      if (!html) return
      const blob = await captureRaportAsBlob(html)
      downloadBlob(blob, `raport-${participant.child_name}.png`)
    } catch {
      addToast({ type: 'error', message: 'Gagal menghasilkan gambar raport.' })
    } finally {
      setActionLoading(null)
    }
  }, [participant, buildRaportHtml, addToast])

  return {
    report,
    session,
    participant,
    photo,
    stageInfos,
    missions,
    assignedMissionIds,
    narrativeText,
    setNarrativeText,
    loading,
    error,
    actionLoading,
    streaming,
    loadData,
    handleGenerateNarrative,
    toggleMission,
    handleApprove,
    handleSend,
    handleCetak,
    handleDownloadPdf,
    handleDownloadPng,
    hasNoAssessment,
  }
}

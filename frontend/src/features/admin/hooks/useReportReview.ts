import { useState, useEffect, useCallback, useRef } from 'react'
import { reportService } from '../../../core/services/reports'
import { openSSE } from '../../../core/services/backendClient'
import { API_ROUTES } from '../../../core/constants/apiRoutes'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { photoService } from '../../../core/services/photos'
import { badgeService } from '../../../core/services/badges'
import { missionService } from '../../../core/services/missions'
import { programService } from '../../../core/services/programs'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { friendlyError, ERROR_MESSAGES } from '../../../core/utils/errorMessages'
import { useAuth } from '../../../core/hooks/useAuth'
import { isSuperAdmin } from '../../../core/utils/permissions'
import { getActiveTenantId } from '../../../core/utils/tenant'
import { formatDate } from '../../../core/utils'
import { getMediaUrl } from '../../../core/utils/media'
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
import { substagesOfStage } from '../../../core/utils/substage'
import { selectMissionsForParticipant } from '../../../core/utils/missionSelector'
import { programSubstageService } from '../../../core/services/programSubstages'
import type {
  Report,
  Participant,
  ParticipantBadge,
  Session,
  Assessment,
  SmartPhoto,
  ProgramStage,
  MissionBank,
  SessionSubstage,
  SessionGroup,
} from '../../../core/types'
import { SessionStageStatus } from '../../../core/types/enums'

export interface KegiatanRow {
  sessionSubstage: SessionSubstage
  programSubstageName: string
  assessment?: Assessment
}

export interface StageInfo {
  programStage: ProgramStage
  sessionStageId: string
  kegiatan: KegiatanRow[]
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
  const [groups, setGroups] = useState<SessionGroup[]>([])
  const [badges, setBadges] = useState<ParticipantBadge[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [narrativeText, setNarrativeText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [hasNoAssessment, setHasNoAssessment] = useState(false)

  const prevTextRef = useRef('')

  // SUPER_ADMIN must pin the request to the report's owning session tenant so the
  // flow works even when the global tenant selector is empty or switched. Non-SA
  // roles never send a tenant header (the middleware rejects it).
  const saTenant: string | undefined =
    isSuperAdmin(user) ? (session?.tenant_id || getActiveTenantId() || undefined) : undefined

  const loadData = useCallback(async () => {
    if (!sessionId || !reportId) return
    setLoading(true)
    setError(null)

    try {
      const [rpt, sess, stageAssessments, sessStages, sessSubstages, partPhotos, sessGroups] =
        await Promise.all([
          reportService.getById(reportId),
          sessionService.getById(sessionId),
          assessmentService.getBySession(sessionId),
          sessionService.getStages(sessionId),
          sessionService.getSubstages(sessionId),
          photoService.getBySession(sessionId),
          sessionService.getGroups(sessionId),
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
      setGroups(sessGroups ?? [])

      // Soft-fail: badge fetch must never break loadData. Degrade to [] on error.
      try {
        setBadges(await badgeService.listByParticipant(part.id))
      } catch {
        setBadges([])
      }

      const partAssessments = stageAssessments.filter((a) => a.participant_id === rpt.participant_id)

      const programStages = await programService.getStages(sess.program_id)
      const progSubs = (await Promise.all(programStages.map((ps) => programSubstageService.listByStage(ps.id)))).flat()
      const nameById = new Map<string, string>(progSubs.map((s) => [s.id, s.name]))
      const builtStageInfos: StageInfo[] = sessStages
        .map((ss) => {
          const pgStage = programStages.find((ps) => ps.id === ss.program_stage_id)
          if (!pgStage) return null
          const kegiatan: KegiatanRow[] = substagesOfStage(sessSubstages, ss.id).map((k) => ({
            sessionSubstage: k,
            programSubstageName: nameById.get(k.program_substage_id) ?? k.program_substage_id,
            assessment: partAssessments.find((a) => a.session_substage_id === k.id),
          }))
          return { programStage: pgStage, sessionStageId: ss.id, kegiatan }
        })
        .filter((s): s is NonNullable<typeof s> => s !== null) as StageInfo[]
      setStageInfos(builtStageInfos)

      const hasNoAssessment = builtStageInfos
        .flatMap((si) => si.kegiatan)
        .every((k) => !k.assessment || k.assessment.star_rating < 1)
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
      await reportService.approve(
        reportId,
        {
          narrative_final: narrativeText,
          mission_ids: assignedMissionIds,
        },
        saTenant,
      )
      await loadData()
      addToast({ type: 'success', message: 'Laporan berhasil disetujui' })
      return true
    } catch {
      setError('Gagal menyetujui laporan.')
      return false
    } finally {
      setActionLoading(null)
    }
  }, [reportId, narrativeText, assignedMissionIds, loadData, addToast, saTenant])

  const handleSend = useCallback(async () => {
    if (!reportId) return
    setActionLoading('send')
    try {
      await reportService.send(reportId, saTenant)
      await loadData()
      addToast({ type: 'success', message: 'Laporan berhasil dikirim ke orang tua' })
      return true
    } catch {
      setError('Gagal mengirim laporan.')
      return false
    } finally {
      setActionLoading(null)
    }
  }, [reportId, loadData, addToast, saTenant])

  const handleGenerateNarrative = useCallback(async (force = false) => {
    if (!reportId || streaming) return false
    setStreaming(true)
    const prev = narrativeText
    prevTextRef.current = prev
    // Start from a clean form (line 0) instead of appending to the old
    // narrative. The 'done' event delivers the authoritative `full` text; if
    // it is missed (SSE race) the token appends land on an empty string rather
    // than concatenating onto the previous generation.
    setNarrativeText('')
    try {
      // Open SSE first so we don't miss early tokens.
      const source = openSSE(
        API_ROUTES.REPORTS.GENERATE_STREAM_SSE(reportId),
        () => {},
        {
          tenantId: saTenant,
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
          // Backend now sends { code, message } (Indonesian). Prefer the code
          // so we stay consistent with friendlyError elsewhere; fall back to
          // the message, then a sensible default.
          const code: string | undefined = parsed.code
          const msg: string | undefined = parsed.message
          addToast({
            type: 'error',
            message: (code && ERROR_MESSAGES[code]) || msg || 'Gagal membuat narasi.',
          })
        } catch { /* ignore */ }
        setNarrativeText(prevTextRef.current)
        source.close()
        setStreaming(false)
      })
      await reportService.generateNarrativeStream(reportId, force, saTenant)
      return true
    } catch (err) {
      setNarrativeText(prevTextRef.current)
      setStreaming(false)
      addToast({ type: 'error', message: friendlyError(err) })
      return false
    }
  }, [reportId, narrativeText, addToast, streaming, saTenant])

  const buildRaportHtml = useCallback((): string | null => {
    if (!participant || !session) return null

    const groupName = participant.group_id
      ? groups.find((g) => g.id === participant.group_id)?.name
      : undefined

    const detailStages = stageInfos.slice(0, 4)
    const extraTopicsCount = Math.max(0, stageInfos.length - 4)

    const stagedStages = detailStages.map((si, i) => ({
      name: si.programStage.name,
      sequenceOrder: si.programStage.sequence_order ?? i + 1,
      kegiatan: si.kegiatan.slice(0, 3).map((k) => ({
        name: k.programSubstageName,
        starRating: k.assessment?.star_rating ?? 0,
      })),
    }))

    const narrative = narrativeText.length > 260 ? `${narrativeText.slice(0, 260)}…` : narrativeText

    const selectedMissionIds = assignedMissionIds.slice(0, 4)
    let missionTitles = missions
      .filter((m) => selectedMissionIds.includes(m.id))
      .map((m) => m.title_child)
    if (missionTitles.length === 0) {
      const picked = selectMissionsForParticipant({
        participantId: participant.id,
        assessments: stageInfos.flatMap((si) =>
          si.kegiatan.map((k) => k.assessment).filter((a): a is NonNullable<typeof a> => !!a),
        ),
        availableMissions: missions,
        sessionStages: stageInfos.map((si) => ({
          id: si.sessionStageId,
          session_id: sessionId ?? '',
          program_stage_id: si.programStage.id,
          status: SessionStageStatus.COMPLETED,
          created_at: '',
        })),
      })
      const pickedIds = picked.slice(0, 4)
      missionTitles = missions
        .filter((m) => pickedIds.includes(m.id))
        .map((m) => m.title_child)
    }

    const mappedBadges = badges.slice(0, 4).map((b) => ({
      badgeName: b.badge_name,
      badgeImageUrl: b.badge_image_url ? getMediaUrl('content', b.badge_image_url) : undefined,
    }))

    return generateMiniRaportHTML({
      childName: participant.child_name,
      childAge: participant.child_age,
      childSchool: participant.school_name || undefined,
      childGroup: groupName || undefined,
      sessionDate: formatDate(session.session_date),
      photoUrl: photo ? getMediaUrl('photo', photo.id) : undefined,
      stages: stagedStages,
      extraTopicsCount: extraTopicsCount > 0 ? extraTopicsCount : undefined,
      narrative,
      facilitatorMessage: DEFAULT_FACILITATOR_MESSAGE,
      missions: missionTitles,
      badges: mappedBadges,
      facilitatorName: user?.name || DEFAULT_FACILITATOR_NAME,
      facilitatorPhotoUrl: user?.avatar_url,
      galleryTitle: `Galeri ${participant.child_name}`,
    })
  }, [participant, session, narrativeText, photo, stageInfos, missions, assignedMissionIds, groups, badges, user])

  const handleCetak = useCallback(() => {
    const html = buildRaportHtml()
    if (!html) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()

    // RISK-1: poll until FontAwesome converts <i> → <svg> before printing.
    // Non-fatal: on timeout, proceed with print anyway rather than hanging.
    const start = Date.now()
    const poll = () => {
      try {
        if (win.closed) return
      } catch {
        return
      }
      const remaining = win.document.querySelectorAll('i[class*="fa-"]')
      if (remaining.length === 0 || Date.now() - start >= 3000) {
        try {
          if (!win.closed) win.print()
        } catch {
          /* window closed */
        }
        return
      }
      setTimeout(poll, 50)
    }
    poll()
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

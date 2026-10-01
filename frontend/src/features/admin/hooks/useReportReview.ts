import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import QRCode from 'qrcode'
import { reportService } from '../../../core/services/reports'
import { openSSE } from '../../../core/services/backend-client'
import { API_ROUTES } from '../../../core/constants/apiRoutes'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { photoService } from '../../../core/services/photos'
import { badgeService } from '../../../core/services/badges'
import { missionService } from '../../../core/services/missions'
import { programService } from '../../../core/services/programs'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { friendlyError } from '../../../core/utils/errorMessages'
import { i18n, tIfExists } from '../../../core/i18n'
import { useAuth } from '../../../core/hooks/useAuth'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { isSuperAdmin } from '../../../core/utils/permissions'
import { formatDate } from '../../../shared/utils'
import { getMediaUrl } from '../../../core/utils/media'
import {
 DEFAULT_FACILITATOR_NAME,
 RAPORT_LAYOUT,
} from '../../../core/constants/report'
import { generateMiniRaportHTML } from '../../../shared/templates/miniRaport'
import {
 captureRaportAsPdf,
 captureRaportAsBlob,
 downloadBlob,
} from '../../../core/utils/raportCapture'
import { substagesOfStage } from '../../../core/utils/substage'
import { splitBadgeSlots } from '../../../core/utils/badgeSlots'
import { programSubstageService } from '../../../core/services/program-substages'
import type {
 Report,
 Participant,
 ParticipantBadge,
 Session,
 Assessment,
 SmartPhoto,
 ReportPhotoPick,
 ProgramStage,
 MissionBank,
 SessionSubstage,
 SessionGroup,
} from '../../../core/types'
import { ReportStatus } from '../../../core/types/enums'

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

export interface TopicTab {
 programStageId: string
 name: string
}

const MAX_MISSIONS = 4

const logError = (scope: string, err: unknown) => {
 console.error(`[${scope}]`, err)
}

/**
 * Resolusi foto rapor topik aktif (spec §4.1): pick topik menang bila foto
 * masih ada; pick yang menunjuk foto terhapus jatuh ke foto is_report_photo
 * peserta (foto rapor harus menggantikan placeholder mini rapor); tanpa pick
 * atau tanpa topik aktif → foto is_report_photo; tidak ada sama sekali → null.
 */
export function resolveReportPhoto(
 picks: ReportPhotoPick[] | null,
 photos: SmartPhoto[],
 participantId: string | undefined,
 activeTopicId: string | null,
): SmartPhoto | null {
 const fallback =
  photos.find((p) => p.participant_id === participantId && p.is_report_photo) ?? null
 if (!picks || !activeTopicId) return fallback
 const pick = picks.find((p) => p.program_stage_id === activeTopicId)
 if (!pick) return fallback
 return photos.find((p) => p.id === pick.photo_id) ?? fallback
}

/** Judul misi untuk preview rapor: HANYA dari pilihan admin
 *  (assignedMissionIds) yang masih ada di bank misi, di-cap
 *  RAPORT_LAYOUT.MAX_MISSIONS_PREVIEW. Tanpa pilihan → [] (tanpa fallback
 *  otomatis — kartu MISI tidak dirender bila kosong). */
export function selectMissionTitles(
 assignedMissionIds: string[],
 missions: MissionBank[],
): string[] {
 const selectedIds = assignedMissionIds.slice(0, RAPORT_LAYOUT.MAX_MISSIONS_PREVIEW)
 return missions.filter((m) => selectedIds.includes(m.id)).map((m) => m.title)
}

export function useReportReview(sessionId: string | undefined, participantId: string | undefined) {
 const { user } = useAuth()
 const { tenantId } = useTenantScope()
 const { addToast } = useGlobalToast()

 const [reportsByTopic, setReportsByTopic] = useState<Record<string, Report>>({})
 const [topics, setTopics] = useState<TopicTab[]>([])
 const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
 const [session, setSession] = useState<Session | null>(null)
 const [participant, setParticipant] = useState<Participant | null>(null)
 const [partPhotos, setPartPhotos] = useState<SmartPhoto[]>([])
 const [partPicks, setPartPicks] = useState<ReportPhotoPick[] | null>(null)
 const [stageInfos, setStageInfos] = useState<StageInfo[]>([])
 const [missions, setMissions] = useState<MissionBank[]>([])
 const [assignedMissionIds, setAssignedMissionIds] = useState<string[]>([])
 const [groups, setGroups] = useState<SessionGroup[]>([])
 const [badges, setBadges] = useState<ParticipantBadge[]>([])
 const [programName, setProgramName] = useState('')
 const [groupCompleted, setGroupCompleted] = useState(true) // default true (fail-open)

 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [actionLoading, setActionLoading] = useState<string | null>(null)
 const [narrativeText, setNarrativeText] = useState('')
 const [streaming, setStreaming] = useState(false)
 const [hasNoAssessment, setHasNoAssessment] = useState(false)
 const [suggesting, setSuggesting] = useState(false)

 const prevTextRef = useRef('')
 const initialLoadDoneRef = useRef(false)
 const saveTimerRef = useRef<number | null>(null)

 const saTenant = isSuperAdmin(user) ? (tenantId ?? undefined) : undefined

 const report = activeTopicId ? reportsByTopic[activeTopicId] ?? null : null

 // Foto rapor diturunkan dari topik aktif + picks (spec §4.1): pick menang →
 // cari foto asli; pick menunjuk foto terhapus → foto is_report_photo peserta;
 // picks gagal dimuat → perilaku lama (R3).
 const photo = useMemo(
  () => resolveReportPhoto(partPicks, partPhotos, participantId, activeTopicId),
  [partPicks, partPhotos, activeTopicId, participantId],
 )

 const loadData = useCallback(async () => {
  if (!sessionId || !participantId) return
  setLoading(true)
  setError(null)

  try {
   const [sess, sessionReports, stageAssessments, sessStages, sessSubstages, partPhotos, picks] =
    await Promise.all([
     sessionService.getById(sessionId),
     reportService.getBySession(sessionId),
     assessmentService.getBySession(sessionId),
     sessionService.getStages(sessionId),
     sessionService.getSubstages(sessionId),
     photoService.getBySession(sessionId),
     photoService.getReportPicks(participantId, sessionId).catch((err) => {
      logError('useReportReview.getReportPicks', err)
      return null
     }),
    ])

   if (!sess) {
    setError(i18n.t('admin.reportReview.sessionMissingError'))
    setLoading(false)
    return
   }

   const partReports = sessionReports.items.filter((r) => r.participant_id === participantId)
   if (partReports.length === 0) {
    setError(i18n.t('admin.reportReview.noReportsError'))
    setLoading(false)
    return
   }

   const byTopic: Record<string, Report> = {}
   for (const r of partReports) {
    const key = r.program_stage_id || ''
    byTopic[key] = r
   }
   setReportsByTopic(byTopic)

   const [programData, programStages] = await Promise.all([
    programService.getById(sess.program_id),
    programService.getStages(sess.program_id),
   ])
   setProgramName(programData?.name ?? '')
   const nameById = new Map(programStages.map((ps) => [ps.id, ps.name]))
   const tabs: TopicTab[] = sessStages
    .map((ss) => ({
     programStageId: ss.program_stage_id,
     name: nameById.get(ss.program_stage_id) ?? i18n.t('admin.col.topic'),
    }))
    // Only show topics that have a generated report for this participant.
    .filter((t) => byTopic[t.programStageId] !== undefined)
   setTopics(tabs)
   setActiveTopicId((prev) => (prev && byTopic[prev] ? prev : (tabs[0]?.programStageId ?? null)))

   setSession(sess)

   const participants = await sessionService.getParticipants(sessionId)
   const part = participants.find((p) => p.id === participantId) || null
   if (!part) {
    setError(i18n.t('admin.reportReview.participantMissingError'))
    setLoading(false)
    return
   }
   setParticipant(part)
   setGroups(sess.groups ?? [])
   const participantGroup = sess.groups?.find((g) => g.id === part?.group_id)
   setGroupCompleted(!participantGroup || participantGroup.status === 'COMPLETED')

   try {
    setBadges(await badgeService.listByParticipant(part.id))
   } catch (err) {
    console.error('[useReportReview] listByParticipant failed', err)
    setBadges([])
   }

   const partAssessments = stageAssessments.filter((a) => a.participant_id === participantId)
   const progSubs = (
    await Promise.all(programStages.map((ps) => programSubstageService.listByStage(ps.id)))
   ).flat()
   const subNameById = new Map<string, string>(progSubs.map((s) => [s.id, s.name]))
   const builtStageInfos: StageInfo[] = sessStages
    .map((ss) => {
     const pgStage = programStages.find((ps) => ps.id === ss.program_stage_id)
     if (!pgStage) return null
     const kegiatan: KegiatanRow[] = substagesOfStage(sessSubstages, ss.id).map((k) => ({
      sessionSubstage: k,
      programSubstageName: subNameById.get(k.program_substage_id) ?? k.program_substage_id,
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

   setPartPhotos(partPhotos)
   setPartPicks(picks)

   const missionResult = await missionService.getAll({ limit: 50 })
   const programMissions = missionResult.data.filter((m) => m.program_id === sess.program_id)
   setMissions(programMissions)
  } catch {
   setError(i18n.t('admin.reportReview.loadError'))
  } finally {
   setLoading(false)
   initialLoadDoneRef.current = true
  }
 }, [sessionId, participantId])

 // When the active topic changes, hydrate the form from that report.
 useEffect(() => {
  if (!activeTopicId) return
  const r = reportsByTopic[activeTopicId]
  if (r) {
   setNarrativeText(r.ai_narrative_final || r.ai_narrative_draft || '')
   setAssignedMissionIds(r.mission_ids || [])
  }
 }, [activeTopicId, reportsByTopic])

 useEffect(() => {
  loadData()
 }, [loadData])

 // Auto-save mission selections when they change (debounced).
 // Skips the initial hydration from loadData to avoid a redundant write.
 useEffect(() => {
  if (!initialLoadDoneRef.current || !report?.id) return
  clearTimeout(saveTimerRef.current ?? undefined)
  saveTimerRef.current = window.setTimeout(() => {
   saveTimerRef.current = null
   reportService.saveMissions(report.id, assignedMissionIds, saTenant).catch((err) => {
    // Silent — auto-save is best-effort; Approve is the authoritative save.
    console.error('[useReportReview] auto-save missions failed', err)
   })
  }, 300)
  return () => {
   clearTimeout(saveTimerRef.current ?? undefined)
  }
 }, [assignedMissionIds, report?.id, saTenant])

 // Topic-scoped mission library (only this Topic's missions) for the modal.
 const loadTopicMissions = useCallback(async (topicId: string) => {
  if (!topicId) return
  try {
   const list = await missionService.getByTopic(topicId, { limit: 100 })
   setMissions(list)
  } catch (err) {
   /* keep existing program-wide list as fallback */
   console.error('[useReportReview] loadTopicMissions failed', err)
  }
 }, [])

 // When active topic changes, load that topic's missions for the modal.
 useEffect(() => {
  if (activeTopicId) loadTopicMissions(activeTopicId)
 }, [activeTopicId, loadTopicMissions])

 const toggleMission = useCallback((missionId: string) => {
  setAssignedMissionIds((prev) => {
   if (prev.includes(missionId)) return prev.filter((id) => id !== missionId)
   if (prev.length >= MAX_MISSIONS) return prev // enforce max-4 at the source
   return [...prev, missionId]
  })
 }, [])

 const handleSuggestMissions = useCallback(async () => {
  if (!report?.id) return
  setSuggesting(true)
  try {
   const ids = await reportService.suggestMissions(report.id, saTenant)
   setAssignedMissionIds((prev) => {
    const merged = [...ids]
    // keep any already-assigned ids beyond the AI set, capped at MAX_MISSIONS
    for (const id of prev) {
     if (!merged.includes(id) && merged.length < MAX_MISSIONS) merged.push(id)
    }
    return merged.slice(0, MAX_MISSIONS)
   })
   addToast({ type: 'success', message: i18n.t('admin.reportReview.suggestMissionsOk') })
  } catch {
   addToast({ type: 'error', message: i18n.t('admin.reportReview.suggestMissionsError') })
  } finally {
   setSuggesting(false)
  }
 }, [report?.id, saTenant, addToast])

 const handleApprove = useCallback(async () => {
  if (!report?.id) return
  setActionLoading('approve')
  try {
   await reportService.approve(
    report.id,
    {
     narrative_final: narrativeText,
     mission_ids: assignedMissionIds,
    },
    saTenant,
   )
   await loadData()
   addToast({ type: 'success', message: i18n.t('admin.reportReview.approveOk') })
   return true
  } catch (err: unknown) {
   const apiErr = err as { code?: string }
   if (apiErr?.code === 'group_not_completed') {
    addToast({ type: 'error', message: i18n.t('admin.reportReview.groupNotCompleted') })
   } else {
    setError(i18n.t('admin.reportReview.approveError'))
   }
   return false
  } finally {
   setActionLoading(null)
  }
 }, [report?.id, narrativeText, assignedMissionIds, loadData, addToast, saTenant])

 const handleSend = useCallback(async () => {
  if (!report?.id) return
  const wasSent = report.status === ReportStatus.SENT
  setActionLoading('send')
  try {
   await reportService.send(report.id, saTenant)
   await loadData()
   addToast({
    type: 'success',
    message: i18n.t(wasSent ? 'admin.reportReview.resendOk' : 'admin.reportReview.sendOk'),
   })
   return true
  } catch (err) {
   // Backend recorded SEND_FAILED (its Send marks failed deliveries retryable);
   // mirror it locally so the button flips back to Send without a full reload.
   if (activeTopicId) {
    setReportsByTopic((prev) => {
     const r = prev[activeTopicId]
     if (!r) return prev
     return { ...prev, [activeTopicId]: { ...r, status: ReportStatus.SEND_FAILED } }
    })
   }
   // Keep the review page alive (setError would replace it with an error
   // state) — the backend message explains what to fix before retrying.
   addToast({
    type: 'error',
    message: err instanceof Error && err.message ? err.message : i18n.t('admin.reportReview.sendError'),
   })
   return false
  } finally {
   setActionLoading(null)
  }
 }, [report?.id, report?.status, activeTopicId, loadData, addToast, saTenant])

 const handleGenerateNarrative = useCallback(async (force = false) => {
  if (!report?.id || streaming) return false
  setStreaming(true)
  const prev = narrativeText
  prevTextRef.current = prev
  setNarrativeText('')
  try {
   const source = openSSE(
    API_ROUTES.REPORTS.GENERATE_STREAM(report.id),
    () => { },
    {
     tenantId: saTenant,
     onError: () => {
      source.close()
      setNarrativeText(prevTextRef.current)
      setStreaming(false)
      addToast({ type: 'error', message: i18n.t('admin.reportReview.narrativeStreamError') })
     },
    },
   )
   source.addEventListener('token', (ev: MessageEvent) => {
    try {
     const parsed = JSON.parse(ev.data)
     if (typeof parsed.delta === 'string') {
      setNarrativeText((t) => t + parsed.delta)
     }
    } catch (err) { /* ignore malformed */ console.warn('[useReportReview] malformed narrative event', err) }
   })
   source.addEventListener('done', (ev: MessageEvent) => {
    try {
     const parsed = JSON.parse(ev.data)
     if (typeof parsed.full === 'string' && parsed.full) {
      setNarrativeText(parsed.full)
     }
    } catch (err) { /* ignore */ console.warn('[useReportReview] malformed done event', err) }
    source.close()
    setStreaming(false)
    addToast({ type: 'success', message: i18n.t('admin.reportReview.narrativeDone') })
   })
   source.addEventListener('error', (ev: MessageEvent) => {
    try {
     const parsed = JSON.parse(ev.data)
     const code: string | undefined = parsed.code
     const msg: string | undefined = parsed.message
     const localised = (code && tIfExists(`errors.${code}`)) || msg || i18n.t('admin.reportReview.narrativeError')
     addToast({
      type: 'error',
      message: localised,
     })
    } catch (err) { /* ignore */ console.warn('[useReportReview] malformed error event', err) }
    setNarrativeText(prevTextRef.current)
    source.close()
    setStreaming(false)
   })
   await reportService.generateNarrativeStream(report.id, force, saTenant)
   return true
  } catch (err) {
   setNarrativeText(prevTextRef.current)
   setStreaming(false)
   addToast({ type: 'error', message: friendlyError(err) })
   return false
  }
 }, [report?.id, narrativeText, addToast, streaming, saTenant])

 const buildRaportHtml = useCallback(async (): Promise<string | null> => {
  if (!participant || !session) return null

  const groupName = participant.group_id
   ? groups.find((g) => g.id === participant.group_id)?.name
   : undefined

  const detailStages = stageInfos.slice(0, RAPORT_LAYOUT.MAX_DETAIL_STAGES)
  const extraTopicsCount = Math.max(0, stageInfos.length - RAPORT_LAYOUT.MAX_DETAIL_STAGES)

  const stagedStages = detailStages.map((si, i) => ({
   name: si.programStage.name,
   sequenceOrder: si.programStage.sequence_order ?? i + 1,
   kegiatan: si.kegiatan.map((k) => ({
    name: k.programSubstageName,
    starRating: k.assessment?.star_rating ?? 0,
   })),
  }))

  const narrative = narrativeText

  const missionTitles = selectMissionTitles(assignedMissionIds, missions)

  // Split DUA SLOT (kontrak D2): kiri = badge topik yang SEDANG direview
  // (activeTopicId), kanan = badge FINAL. Cap 4 diterapkan SETELAH split agar
  // badge topik aktif tidak tergeser oleh daftar topik lain.
  const { topicBadges, finalBadge } = splitBadgeSlots(
   badges.map((b) => ({
    badgeName: b.badge_name,
    badgeImageUrl: b.badge_image_url ? getMediaUrl('content', b.badge_image_url) : undefined,
    badge_type: b.badge_type,
    program_stage_id: b.program_stage_id,
   })),
   activeTopicId,
  )

  const topicName = topics.find((t) => t.programStageId === activeTopicId)?.name ?? ''

  let galleryUrl: string | undefined
  if (report?.gallery_access_token) {
   try {
    galleryUrl = await QRCode.toDataURL(
     `${window.location.origin}/gallery?token=${report.gallery_access_token}`,
     { width: 128, margin: 1, errorCorrectionLevel: 'M' },
    )
   } catch (err) {
    // QR is decorative (gallery link) — degrade to the template placeholder,
    // but never swallow the cause: a broken encoder/token must be diagnosable.
    console.warn('[useReportReview] gallery QR generation failed', err)
   }
  }

  return generateMiniRaportHTML({
   programName,
   topicName,
   childName: participant.child_name,
   childAge: participant.child_age,
   childSchool: participant.school_name || undefined,
   childGroup: groupName || undefined,
   sessionDate: formatDate(session.session_date),
   photoUrl: photo ? getMediaUrl('photo', photo.id) : undefined,
   stages: stagedStages,
   extraTopicsCount: extraTopicsCount > 0 ? extraTopicsCount : undefined,
   narrative,
   missions: missionTitles,
   badgeTopics: topicBadges.slice(0, RAPORT_LAYOUT.MAX_BADGES_PREVIEW),
   badgeFinal: finalBadge,
   facilitatorName:
    (participant.group_id
     ? groups.find((g) => g.id === participant.group_id)?.facilitator_name
     : undefined)?.trim() || DEFAULT_FACILITATOR_NAME,
   galleryUrl,
  })
 }, [participant, session, report, narrativeText, photo, stageInfos, missions, assignedMissionIds, groups, badges, programName, activeTopicId, topics])

 const handleCetak = useCallback(async () => {
  const html = await buildRaportHtml()
  if (!html) return
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  const start = Date.now()
  const poll = () => {
   try {
    if (win.closed) return
   } catch (err) {
    // Cross-origin/inaccessible window: printing cannot proceed — stop the
    // poll and record why instead of aborting silently (fires once).
    console.warn('[useReportReview] print window inaccessible; aborting print', err)
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
   const html = await buildRaportHtml()
   if (!html) return
   await captureRaportAsPdf(html, `raport-${participant.child_name}.pdf`)
  } catch {
   addToast({ type: 'error', message: i18n.t('admin.reportReview.pdfError') })
  } finally {
   setActionLoading(null)
  }
 }, [participant, buildRaportHtml, addToast])

 const handleDownloadPng = useCallback(async () => {
  if (!participant) return
  setActionLoading('png')
  try {
   const html = await buildRaportHtml()
   if (!html) return
   const blob = await captureRaportAsBlob(html)
   downloadBlob(blob, `raport-${participant.child_name}.png`)
  } catch {
   addToast({ type: 'error', message: i18n.t('admin.reportReview.pngError') })
  } finally {
   setActionLoading(null)
  }
 }, [participant, buildRaportHtml, addToast])

 return {
  report,
  reportsByTopic,
  topics,
  activeTopicId,
  setActiveTopicId,
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
  suggesting,
  streaming,
  loadData,
  loadTopicMissions,
  handleGenerateNarrative,
  toggleMission,
  handleSuggestMissions,
  handleApprove,
  handleSend,
  handleCetak,
  handleDownloadPdf,
  handleDownloadPng,
  hasNoAssessment,
  groupCompleted,
 }
}

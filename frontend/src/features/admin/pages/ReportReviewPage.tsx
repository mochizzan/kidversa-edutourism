import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import {
  ArrowLeft,
  Star,
  Camera,
  Send,
  CheckCircle,
  Printer,
  Loader2,
  FileText,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { Modal } from '../../../shared/components/ui/Modal'
import { reportService } from '../../../core/services/reports'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { photoService } from '../../../core/services/photos'
import { missionService } from '../../../core/services/missions'
import { programService } from '../../../core/services/programs'
import type {
  Report,
  Participant,
  Session,
  Assessment,
  SmartPhoto,
  ProgramStage,
  MissionBank,
} from '../../../core/types'
import { ReportStatus, MissionCategory } from '../../../core/types/enums'
import { formatDate, cn } from '../../../core/utils'
import { useAuth } from '../../../core/hooks/useAuth'
import {
  reportStatusBadge,
  reportStatusLabel,
  reportStatusBg,
} from '../../../core/constants/reportStatus'
import {
  DEFAULT_FACILITATOR_MESSAGE,
  DEFAULT_FACILITATOR_NAME,
  missionCategoryLabels,
  missionCategoryIcons,
} from '../../../core/constants/report'
import { generateMiniRaportHTML } from '../../../shared/templates/miniRaport'
import { captureRaportAsPdf, captureRaportAsBlob, downloadBlob } from '../../../core/utils/raportCapture'
import { extractFirstSentence } from '../../../core/utils/reportNarrative'
import { resolveStoredUpload } from '../../../core/utils/media'

/* ── Combined stage info for rendering ── */
interface StageInfo {
  programStage: ProgramStage
  sessionStageId: string
  assessment?: Assessment
}

/* ── Page ── */
const ReportReviewPage = () => {
  const { sessionId, reportId } = useParams<{ sessionId: string; reportId: string }>()
  const navigate = useNavigate()

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
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [showSendConfirm, setShowSendConfirm] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const { user } = useAuth()
  const { addToast } = useGlobalToast()

  const loadData = async () => {
    if (!sessionId || !reportId) return
    setLoading(true)
    setError(null)

    try {
      const [rpt, sess, stageAssessments, sessStages, partPhotos] =
        await Promise.all([
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
      setParticipant(part)

      const partAssessments = stageAssessments.filter(
        (a) => a.participant_id === rpt.participant_id
      )

      const programStages = await programService.getStages(sess.program_id)
      const builtStageInfos: StageInfo[] = sessStages
        .map((ss) => {
          const pgStage = programStages.find((ps) => ps.id === ss.program_stage_id)
          if (!pgStage) return null
          const assessment = partAssessments.find(
            (a) => a.session_stage_id === ss.id
          )
          return {
            programStage: pgStage,
            sessionStageId: ss.id,
            assessment,
          } as StageInfo
        })
        .filter((s): s is NonNullable<typeof s> => s !== null) as StageInfo[]
      setStageInfos(builtStageInfos)

      const reportPhoto =
        partPhotos.find(
          (p) => p.participant_id === rpt.participant_id && p.is_report_photo
        ) || null
      setPhoto(reportPhoto)

      const missionResult = await missionService.getAll({ limit: 50 })
      const programMissions = missionResult.data.filter(
        (m) => m.program_id === sess.program_id
      )
      setMissions(programMissions)
      setAssignedMissionIds(rpt.mission_ids_json || [])
    } catch (err) {
      console.error('Failed to load report data:', err)
      setError('Gagal memuat data laporan.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [sessionId, reportId])

  /* ── Toggle mission assignment ── */
  const toggleMission = (missionId: string) => {
    setAssignedMissionIds((prev) =>
      prev.includes(missionId)
        ? prev.filter((id) => id !== missionId)
        : [...prev, missionId]
    )
  }

  /* ── Approve report ── */
  const handleApprove = async () => {
    if (!reportId) return
    setActionLoading('approve')
    try {
      await reportService.approve(reportId, {
        narrative_final: narrativeText,
        mission_ids: assignedMissionIds,
      })
      setShowApproveConfirm(false)
      await loadData()
      addToast({ type: 'success', message: 'Laporan berhasil disetujui' })
    } catch (err) {
      console.error('Failed to approve report:', err)
      setError('Gagal menyetujui laporan.')
    } finally {
      setActionLoading(null)
    }
  }

  /* ── Send report ── */
  const handleSend = async () => {
    if (!reportId) return
    setActionLoading('send')
    try {
      await reportService.send(reportId)
      setShowSendConfirm(false)
      await loadData()
      addToast({ type: 'success', message: 'Laporan berhasil dikirim ke orang tua' })
    } catch (err) {
      console.error('Failed to send report:', err)
      setError('Gagal mengirim laporan.')
    } finally {
      setActionLoading(null)
    }
  }

  /* ── Build mini raport HTML (shared by print + PNG) ── */
  const buildRaportHtml = (): string | null => {
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
  }

  /* ── Cetak: open new window + print dialog ── */
  const handleCetak = () => {
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
  }

  /* ── Unduh PDF: generate actual PDF file download ── */
  const handleDownloadPdf = async () => {
    if (!participant) return
    setActionLoading('pdf')
    try {
      const html = buildRaportHtml()
      if (!html) return
      await captureRaportAsPdf(html, `raport-${participant.child_name}.pdf`)
    } catch (err) {
      console.error('Failed to generate PDF:', err)
      addToast({ type: 'error', message: 'Gagal menghasilkan file PDF.' })
    } finally {
      setActionLoading(null)
    }
  }

  /* ── PNG download ── */
  const handleDownloadPng = async () => {
    if (!participant) return
    setActionLoading('png')
    try {
      const html = buildRaportHtml()
      if (!html) return
      const blob = await captureRaportAsBlob(html)
      downloadBlob(blob, `raport-${participant.child_name}.png`)
    } catch (err) {
      console.error('Failed to generate PNG:', err)
      addToast({ type: 'error', message: 'Gagal menghasilkan gambar raport.' })
    } finally {
      setActionLoading(null)
    }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Memuat..."
          breadcrumbs={[
            { label: 'Laporan', href: ROUTES.ADMIN.REPORTS },
            { label: sessionId ? 'Session' : '', href: sessionId ? `/admin/reports/${sessionId}` : undefined },
            { label: 'Review' },
          ].filter((b) => b.label)}
        />
        <div className="bg-surface rounded-2xl p-6 animate-pulse space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-surface-variant rounded" />
          ))}
        </div>
      </div>
    )
  }

  /* ── Error ── */
  if (error || !report || !participant || !session) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Error"
          breadcrumbs={[
            { label: 'Laporan', href: ROUTES.ADMIN.REPORTS },
            { label: 'Review' },
          ]}
        />
        <div className="flex gap-2 justify-center">
          <Button
            variant="secondary"
            onClick={() => navigate(`/admin/reports/${sessionId}`)}
          >
            Kembali
          </Button>
        </div>
        <ErrorState message={error || 'Data tidak ditemukan.'} onRetry={loadData} />
      </div>
    )
  }

  const canApprove =
    report.status === ReportStatus.DRAFT || report.status === ReportStatus.PENDING_REVIEW
  const canSend = report.status === ReportStatus.APPROVED

  return (
    <div className="space-y-6">
      <PageHeader
        title={participant.child_name}
        subtitle="Review dan kelola laporan peserta"
        breadcrumbs={[
          { label: 'Laporan', href: ROUTES.ADMIN.REPORTS },
          {
            label: session.name,
            href: `/admin/reports/${sessionId}`,
          },
          { label: participant.child_name },
        ]}
        className="no-print"
      />

      {/* Status banner */}
      <div
        className={cn(
          'rounded-2xl p-4 flex flex-col gap-3 no-print',
          reportStatusBg[report.status]
        )}
      >
        <div className="flex items-center gap-3">
          <Badge variant={reportStatusBadge[report.status] || 'neutral'} size="md">
            {reportStatusLabel[report.status] || report.status}
          </Badge>
          <span className="text-sm font-medium">
            {report.status === ReportStatus.SENT
              ? `Laporan telah dikirim pada ${report.sent_at ? formatDate(report.sent_at) : '-'}`
              : report.status === ReportStatus.APPROVED
              ? 'Laporan sudah disetujui dan siap dikirim ke orang tua'
              : report.status === ReportStatus.DRAFT
              ? 'Laporan masih dalam bentuk draft, review sebelum dikirim'
              : 'Laporan menunggu review'}
          </span>
        </div>
        {report.status === ReportStatus.SENT && report.parent_access_token && (
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs bg-black/10 px-2 py-1 rounded-lg break-all">
              {`${window.location.origin}/parent/report?token=${report.parent_access_token}`}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}/parent/report?token=${report.parent_access_token}`
                  )
                  setCopiedLink(true)
                  setTimeout(() => setCopiedLink(false), 2000)
                } catch {
                  /* clipboard unavailable */
                }
              }}
            >
              {copiedLink ? 'Tersalin' : 'Salin Link'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                window.open(
                  `/parent/report?token=${report.parent_access_token}`,
                  '_blank'
                )
              }
            >
              Buka Halaman Orang Tua
            </Button>
          </div>
        )}
      </div>

      {/* Sent content summary (read-only) */}
      {report.status === ReportStatus.SENT && (
        <Card title="Ringkasan yang Dikirim" subtitle="Konten yang telah dikirim ke orang tua">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1">
                Narasi
              </p>
              <p className="text-sm text-on-surface whitespace-pre-wrap">
                {narrativeText || '-'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1">
                Misi Lanjutan
              </p>
              {assignedMissionIds.length === 0 ? (
                <p className="text-sm text-on-surface-variant">Tidak ada misi dipilih</p>
              ) : (
                <ul className="text-sm text-on-surface space-y-1">
                  {missions
                    .filter((m) => assignedMissionIds.includes(m.id))
                    .map((m) => (
                      <li key={m.id} className="flex items-start gap-2">
                        <span>•</span>
                        <span>{m.title_child}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            {photo && (
              <div>
                <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1">
                  Foto
                </p>
                <img
                  src={(resolveStoredUpload(photo.framed_file_url || photo.original_file_url, 'photo')) ?? (photo.framed_file_url || photo.original_file_url)}
                  alt={participant.child_name}
                  className="w-24 h-24 object-cover rounded-xl"
                />
              </div>
            )}
            <p className="text-xs text-on-surface-variant">
              Waktu kirim: {report.sent_at ? formatDate(report.sent_at) : '-'}
            </p>
          </div>
        </Card>
      )}

      {/* Main review content */}
      <div className="grid gap-6 print-report">
        {/* 1. Child Identity + Photo */}
        <Card>
          <div className="flex items-start gap-5">
            {/* Photo */}
            <div className="w-20 h-20 rounded-2xl bg-surface-variant flex items-center justify-center shrink-0 overflow-hidden">
              {photo ? (
                <img
                  src={(resolveStoredUpload(photo.framed_file_url || photo.original_file_url, 'photo')) ?? (photo.framed_file_url || photo.original_file_url)}
                  alt={participant.child_name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                    ;(e.target as HTMLImageElement).parentElement!.innerHTML =
                      '<div class="w-full h-full flex items-center justify-center"><svg class="w-8 h-8 text-on-surface-variant" ... /></div>'
                  }}
                />
              ) : (
                <Camera className="w-8 h-8 text-on-surface-variant" />
              )}
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-on-surface">{participant.child_name}</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">Usia:</span>
                  <span className="text-on-surface font-medium">{participant.child_age} tahun</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">Sekolah:</span>
                  <span className="text-on-surface font-medium">
                    {participant.school_name || '-'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">Orang Tua:</span>
                  <span className="text-on-surface font-medium">{participant.parent_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">Sesi:</span>
                  <span className="text-on-surface font-medium">{session.name}</span>
                </div>
              </div>

              {/* Photo consent warning */}
              {!photo && (
                <p className="mt-3 text-xs text-yellow-600 flex items-center gap-1.5 no-print">
                  <Camera className="w-3.5 h-3.5" />
                  {participant.consent_photo === false
                    ? 'Izin foto tidak diberikan — foto tidak tersedia'
                    : 'Belum ada foto yang dipilih untuk laporan'}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* 2. Assessment Scores per Stage */}
        <Card title="Penilaian per Tahapan" subtitle="Skor bintang dan komentar dari fasilitator">
          {stageInfos.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4">
              Belum ada data tahapan untuk sesi ini.
            </p>
          ) : (
            <div className="space-y-4">
              {stageInfos.map(({ programStage, sessionStageId, assessment }) => (
                <div
                  key={sessionStageId}
                  className="p-4 rounded-xl bg-surface-container-low"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-on-surface text-sm">{programStage.name}</p>
                    {assessment ? (
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={cn(
                              'w-4 h-4',
                              star <= assessment.star_rating
                                ? 'text-accent fill-accent'
                                : 'text-on-surface-variant/30'
                            )}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-on-surface-variant">Belum dinilai</span>
                    )}
                  </div>
                  {assessment?.comment && (
                    <p className="text-sm text-on-surface-variant italic">
                      &ldquo;{assessment.comment}&rdquo;
                    </p>
                  )}
                  {!assessment && (
                    <p className="text-xs text-yellow-600 no-print">Tidak ada penilaian untuk tahap ini</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 3. AI Narrative */}
        {report.status !== ReportStatus.SENT && (
        <Card title="Narasi AI" subtitle="Draft narasi yang akan dikirim ke orang tua">
          <textarea
            value={narrativeText}
            onChange={(e) => setNarrativeText(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-outline-variant bg-surface p-4 text-sm placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none resize-y no-print"
            placeholder="Narasi akan muncul setelah laporan di-generate..."
          />
          <div className="print-report whitespace-pre-wrap p-4 hidden">
            {narrativeText}
          </div>
          <div className="flex items-center justify-between mt-2 no-print">
            <p className="text-xs text-on-surface-variant">
              Edit narasi sesuai kebutuhan sebelum menyetujui laporan.
            </p>
            <span className="text-xs text-on-surface-variant">
              {narrativeText.length} karakter
            </span>
          </div>
        </Card>
        )}

        {/* 4. Mission Assignments */}
        {report.status !== ReportStatus.SENT && (
        <Card
          title="Misi Lanjutan"
          subtitle="Pilih misi yang akan diberikan kepada orang tua"
        >
          {missions.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4">
              Belum ada misi yang tersedia untuk program ini.
            </p>
          ) : (
            <div className="space-y-4">
              {[MissionCategory.HOME, MissionCategory.PARENT, MissionCategory.SCHOOL].map(
                (cat) => {
                  const catMissions = missions.filter((m) => m.category === cat)
                  if (catMissions.length === 0) return null

                  return (
                    <div key={cat}>
                      <p className="text-sm font-medium text-on-surface mb-2 flex items-center gap-2">
                        <span>{missionCategoryIcons[cat]}</span>
                        {missionCategoryLabels[cat]}
                      </p>
                      <div className="space-y-2">
                        {catMissions.map((mission) => (
                          <label
                            key={mission.id}
                            className={cn(
                              'flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors no-print',
                              assignedMissionIds.includes(mission.id)
                                ? 'bg-primary-container/30 border border-primary-container'
                                : 'bg-surface-variant hover:bg-surface-container border border-transparent'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={assignedMissionIds.includes(mission.id)}
                              onChange={() => toggleMission(mission.id)}
                              className="mt-0.5 w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary-container"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-on-surface">
                                {mission.title_child}
                              </p>
                              <p className="text-xs text-on-surface-variant mt-0.5">
                                {mission.title_parent}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                      <div className="hidden print:block mt-2">
                        {catMissions.filter(m => assignedMissionIds.includes(m.id)).map(mission => (
                          <p key={mission.id} className="text-sm">
                            • {mission.title_child}
                          </p>
                        ))}
                      </div>
                    </div>
                  )
                }
              )}

              {assignedMissionIds.length > 0 && (
                <div className="text-xs text-on-surface-variant pt-2 border-t border-outline-variant no-print">
                  {assignedMissionIds.length} misi dipilih
                </div>
              )}
            </div>
          )}
        </Card>
        )}

      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3 bg-surface rounded-2xl p-4 border border-outline-variant sticky bottom-4 shadow-lg no-print">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/admin/reports/${sessionId}`)}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
        </Button>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={handleCetak} disabled={!!actionLoading}>
          <Printer className="w-4 h-4 mr-1" /> Cetak
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDownloadPdf} disabled={!!actionLoading}>
          {actionLoading === 'pdf' ? (
            <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Memproses...</>
          ) : (
            <><FileText className="w-4 h-4 mr-1" /> Unduh PDF</>
          )}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDownloadPng} disabled={!!actionLoading}>
          {actionLoading === 'png' ? (
            <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Memproses...</>
          ) : (
            <><Camera className="w-4 h-4 mr-1" /> Unduh PNG</>
          )}
        </Button>
        {canApprove && (
          <Button
            size="sm"
            onClick={() => setShowApproveConfirm(true)}
            disabled={actionLoading === 'approve'}
          >
            {actionLoading === 'approve' ? (
              <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Memproses...</>
            ) : (
              <><CheckCircle className="w-4 h-4 mr-1" /> Setujui</>
            )}
          </Button>
        )}
        {canSend && (
          <Button
            size="sm"
            onClick={() => setShowSendConfirm(true)}
            disabled={actionLoading === 'send'}
          >
            {actionLoading === 'send' ? (
              <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Mengirim...</>
            ) : (
              <><Send className="w-4 h-4 mr-1" /> Kirim ke Orang Tua</>
            )}
          </Button>
        )}
      </div>

      {/* ── Approve confirm modal ── */}
      <Modal
        open={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        title="Setujui Laporan"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowApproveConfirm(false)}>
              Batal
            </Button>
            <Button onClick={handleApprove} disabled={actionLoading === 'approve'}>
              {actionLoading === 'approve' ? 'Memproses...' : 'Setujui'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Setelah disetujui, laporan akan siap dikirim ke orang tua/wali dari{' '}
          <strong>{participant.child_name}</strong>.
        </p>
      </Modal>

      {/* ── Send confirm modal ── */}
      <Modal
        open={showSendConfirm}
        onClose={() => setShowSendConfirm(false)}
        title="Kirim Laporan ke Orang Tua"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowSendConfirm(false)}>
              Batal
            </Button>
            <Button onClick={handleSend} disabled={actionLoading === 'send'}>
              {actionLoading === 'send' ? 'Mengirim...' : 'Kirim'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Laporan akan dikirim ke orang tua/wali dari <strong>{participant.child_name}</strong>{' '}
          melalui tautan yang aman. Orang tua akan dapat melihat laporan lengkap beserta misi lanjutan.
        </p>
      </Modal>
    </div>
  )
}

export default ReportReviewPage

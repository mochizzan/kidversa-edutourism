import { useEffect, useState, useRef } from 'react'
import { FileText, Printer, Camera } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { Loader2 } from 'lucide-react'
import {
  ParentTokenGuard,
  useParentToken,
} from '../../../shared/components/auth/ParentTokenGuard'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { photoService } from '../../../core/services/photos'
import { programService } from '../../../core/services/programs'
import { missionService } from '../../../core/services/missions'
import { userService } from '../../../core/services/users'
import type { ProgramStage, MissionBank } from '../../../core/types'
import { formatDate } from '../../../core/utils'
import { generateMiniRaportHTML } from '../../../shared/templates/miniRaport'
import { captureRaportAsPdf, captureRaportAsBlob, downloadBlob } from '../../../core/utils/raportCapture'
import { DEFAULT_FACILITATOR_MESSAGE, DEFAULT_FACILITATOR_NAME, A4_SHEET_WIDTH } from '../../../core/constants/report'

/* ── Inner report component ── */
function ReportView() {
  const { report, participant, loading: guardLoading, error: guardError } = useParentToken()

  const [raportHtml, setRaportHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
  const [iframeHeight, setIframeHeight] = useState(0)

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const scaleFactor = Math.min(1, windowWidth / A4_SHEET_WIDTH)
  const scaledHeight = iframeHeight * scaleFactor

  useEffect(() => {
    if (!report || !participant) return

    const loadDetails = async () => {
      try {
        const sess = await sessionService.getById(report.session_id)
        if (!sess) {
          setError('Sesi tidak ditemukan.')
          setLoading(false)
          return
        }

        const [sessAssessments, sessPhotos, sessStages, programStages, missionResult] =
          await Promise.all([
            assessmentService.getBySession(report.session_id),
            photoService.getBySession(report.session_id),
            sessionService.getStages(report.session_id),
            programService.getStages(sess.program_id),
            missionService.getAll({ limit: 50 }),
          ])

        const partAssessments = sessAssessments.filter(
          (a) => a.participant_id === participant.id
        )

        const builtStageInfos: { programStage: ProgramStage; starRating: number }[] =
          sessStages
            .map((ss) => {
              const pgStage = programStages.find((ps) => ps.id === ss.program_stage_id)
              if (!pgStage) return null
              const assessment = partAssessments.find((a) => a.session_stage_id === ss.id)
              return {
                programStage: pgStage,
                starRating: assessment?.star_rating ?? 0,
              }
            })
            .filter((s): s is NonNullable<typeof s> => s !== null)

        const reportPhoto =
          sessPhotos.find(
            (p) => p.participant_id === participant.id && p.is_report_photo
          ) || sessPhotos.find((p) => p.participant_id === participant.id) || null

        const programMissions: MissionBank[] = missionResult.data.filter(
          (m) => m.program_id === sess.program_id
        )
        const selected = programMissions
          .filter((m) => (report.mission_ids_json || []).includes(m.id))
          .map((m) => m.title_child)

        let facName = DEFAULT_FACILITATOR_NAME
        let facPhoto: string | undefined = undefined
        if (sess.created_by) {
          const facilitator = await userService.getById(sess.created_by)
          if (facilitator) {
            facName = facilitator.name || DEFAULT_FACILITATOR_NAME
            facPhoto = facilitator.avatar_url
          }
        }

        const narrative = report.ai_narrative_final || report.ai_narrative_draft || ''
        const quote = narrative
          ? (narrative.match(/^[^.!?\n]+[.!?]/)?.[0]?.trim() ||
            narrative.split('\n')[0].trim().slice(0, 120))
          : undefined

        const html = generateMiniRaportHTML({
          childName: participant.child_name,
          childAge: participant.child_age,
          sessionDate: formatDate(sess.session_date),
          photoUrl: reportPhoto?.framed_file_url || reportPhoto?.original_file_url,
          quote,
          stages: builtStageInfos.map((si, i) => ({
            name: si.programStage.name,
            sequenceOrder: i + 1,
            starRating: si.starRating,
          })),
          narrative,
          facilitatorMessage: DEFAULT_FACILITATOR_MESSAGE,
          missions: selected,
          facilitatorName: facName,
          facilitatorPhotoUrl: facPhoto,
        })
        setRaportHtml(html)
        setLoading(false)
      } catch (err) {
        console.error('Failed to load parent report:', err)
        setError('Gagal memuat detail laporan.')
        setLoading(false)
      }
    }

    loadDetails()
  }, [report, participant])

  /* ── Cetak: print the existing rendered iframe directly ── */
  const handleCetak = () => {
    iframeRef.current?.contentWindow?.print()
  }

  /* ── Unduh PDF: render a hidden iframe from the report HTML and capture it ── */
  const handleDownloadPdf = async () => {
    if (!raportHtml || !participant) return
    setActionLoading('pdf')
    try {
      await captureRaportAsPdf(raportHtml, `raport-${participant.child_name}.pdf`)
    } catch (err) {
      console.error('Failed to generate PDF:', err)
      setDownloadError('Gagal menghasilkan file PDF.')
    } finally {
      setActionLoading(null)
    }
  }

  /* ── PNG download: render a hidden iframe from the report HTML and capture it ── */
  const handleDownloadPng = async () => {
    if (!raportHtml || !participant) return
    setActionLoading('png')
    try {
      const blob = await captureRaportAsBlob(raportHtml)
      downloadBlob(blob, `raport-${participant.child_name}.png`)
    } catch (err) {
      console.error('Failed to generate PNG:', err)
      setDownloadError('Gagal menghasilkan gambar raport.')
    } finally {
      setActionLoading(null)
    }
  }

  /* ── Auto-clear download error ── */
  useEffect(() => {
    if (!downloadError) return
    const timer = setTimeout(() => setDownloadError(null), 3000)
    return () => clearTimeout(timer)
  }, [downloadError])

  /* ── iframe auto-height ── */
  const handleIframeLoad = () => {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return
    const height = iframe.contentDocument.body.scrollHeight
    iframe.style.height = `${height}px`
    setIframeHeight(height)
  }

  /* ── Guard loading ── */
  if (guardLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-200">
        <div className="text-center">
          <Loader2 className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm text-on-surface-variant">Memuat laporan...</p>
        </div>
      </div>
    )
  }

  /* ── Error ── */
  if (guardError || error || !report || !participant || !raportHtml) {
    return (
      <div className="min-h-screen bg-gray-200 py-8">
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="Laporan tidak tersedia"
          description={
            guardError === 'INVALID'
              ? 'Tautan tidak valid.'
              : guardError === 'EXPIRED'
              ? 'Laporan sudah tidak tersedia.'
              : error || 'Terjadi kesalahan saat memuat laporan.'
          }
        />
      </div>
    )
  }

  /* ── Render: mini raport fills viewport + floating toolbar ── */
  return (
    <div className="relative min-h-screen bg-gray-200 print-report">
        <div
          className="mx-auto overflow-hidden"
          style={{ width: '100%', maxWidth: A4_SHEET_WIDTH }}
        >
          <div
            style={{
              width: A4_SHEET_WIDTH,
              transform: `scale(${scaleFactor})`,
              transformOrigin: 'top center',
              height: scaledHeight || 'auto',
            }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={raportHtml}
              title="Mini Raport"
              onLoad={handleIframeLoad}
              className="border-0 block"
              style={{ width: A4_SHEET_WIDTH, border: 'none' }}
            />
          </div>
        </div>

      {downloadError && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2 shadow-lg no-print">
          {downloadError}
        </div>
      )}

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-surface rounded-2xl p-3 border border-outline-variant shadow-lg no-print">
        <Button variant="secondary" size="sm" onClick={handleCetak}>
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
      </div>
    </div>
  )
}

/* ── Page wrapper ── */
const ReportPage = () => {
  return (
    <ParentTokenGuard>
      <ReportView />
    </ParentTokenGuard>
  )
}

export default ReportPage

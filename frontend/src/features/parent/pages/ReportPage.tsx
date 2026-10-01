import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Printer, Camera } from 'lucide-react'
import QRCode from 'qrcode'
import { Button } from '../../../shared/components/ui/Button'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { RaportZoomPan } from '../../../shared/components/feedback/RaportZoomPan'
import { Loader2 } from 'lucide-react'
import {
  ParentTokenGuard,
  useParentToken,
} from '../../../shared/components/auth/ParentTokenGuard'
import { generateMiniRaportHTML } from '../../../shared/templates/miniRaport'
import { formatDate } from '../../../shared/utils'
import { captureRaportAsPdf, captureRaportAsBlob, downloadBlob } from '../../../core/utils/raportCapture'
import { splitBadgeSlots } from '../../../core/utils/badgeSlots'
import {
  DEFAULT_FACILITATOR_NAME,
  RAPORT_LAYOUT,
  A4_SHEET_WIDTH,
} from '../../../core/constants/report'
import { API_ROUTES } from '@/core/constants/apiRoutes'

/* ── Inner report component ── */
function ReportView() {
  const { t } = useTranslation()
  const { token, report, loading: guardLoading, error: guardError } = useParentToken()

  const [raportHtml, setRaportHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [iframeHeight, setIframeHeight] = useState(0)

  useEffect(() => {
    if (!report) return

    let cancelled = false

    // Parity with the admin preview: the extended GET /api/reports/access
    // payload is mapped field-by-field exactly like
    // useReportReview.buildRaportHtml → generateMiniRaportHTML (same caps,
    // defaults, QR options), so the parent rapor content matches the admin.
    const buildHtml = async () => {
      const stages = report.stages ?? []
      const detailStages = stages.slice(0, RAPORT_LAYOUT.MAX_DETAIL_STAGES)
      const extraTopicsCount = Math.max(0, stages.length - RAPORT_LAYOUT.MAX_DETAIL_STAGES)

      let galleryUrl: string | undefined
      if (report.gallery_access_token) {
        try {
          galleryUrl = await QRCode.toDataURL(
            `${window.location.origin}/gallery?token=${report.gallery_access_token}`,
            { width: 128, margin: 1, errorCorrectionLevel: 'M' },
          )
        } catch (err) {
          // QR is decorative (gallery link) — fall back to the template
          // placeholder — but the cause must stay diagnosable, matching
          // useReportReview's QR handling.
          console.warn('[ReportPage] gallery QR generation failed', err)
        }
      }

      // Split DUA SLOT (kontrak D2): kiri = badge topik rapor ini, kanan =
      // badge FINAL. Field pemisah boleh undefined (payload legacy) — util
      // fallback toleran; report tanpa stage key → semua topik di slot kiri.
      const { topicBadges, finalBadge } = splitBadgeSlots(
        (report.badges ?? []).map((b) => ({
          badgeName: b.badge_name,
          badgeImageUrl: b.badge_image_url || undefined,
          badge_type: b.badge_type,
          program_stage_id: b.program_stage_id,
        })),
        report.program_stage_id ?? '',
      )

      return generateMiniRaportHTML({
        programName: report.program_name || '',
        topicName: report.topic_name || '',
        childName: report.child_name || '',
        childAge: report.child_age ?? 0,
        childSchool: report.school_name || undefined,
        childGroup: report.group_name || undefined,
        sessionDate: formatDate(report.session_date ?? ''),
        photoUrl: report.photo_url
          ? `${API_ROUTES.REPORTS.ACCESS_PHOTO}?token=${encodeURIComponent(token)}`
          : undefined,
        stages: detailStages.map((s, i) => ({
          name: s.name,
          sequenceOrder: s.sequence_order ?? i + 1,
          kegiatan: (s.kegiatan ?? []).map((k) => ({
            name: k.name,
            starRating: k.star_rating ?? 0,
          })),
        })),
        extraTopicsCount: extraTopicsCount > 0 ? extraTopicsCount : undefined,
        narrative: report.ai_narrative_final || '',
        missions: (report.missions ?? [])
          .slice(0, RAPORT_LAYOUT.MAX_MISSIONS_PREVIEW)
          .map((m) => m.title),
        badgeTopics: topicBadges.slice(0, RAPORT_LAYOUT.MAX_BADGES_PREVIEW),
        badgeFinal: finalBadge,
        facilitatorName: report.facilitator_name?.trim() || DEFAULT_FACILITATOR_NAME,
        galleryUrl,
      })
    }

    buildHtml()
      .then((html) => {
        if (cancelled) return
        setRaportHtml(html)
      })
      .catch((err) => {
        if (cancelled) return
        // User sees a friendly error state; the cause is logged so a broken
        // split/template step stays diagnosable instead of vanishing.
        console.error('[ReportPage] build mini-raport html failed', err)
        setError(t('parent.report.loadError'))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [report, token, t])

  /* ── Cetak: print the existing rendered iframe directly ── */
  const handleCetak = () => {
    iframeRef.current?.contentWindow?.print()
  }

  /* ── Unduh PDF: render a hidden iframe from the report HTML and capture it ── */
  const handleDownloadPdf = async () => {
    if (!raportHtml) return
    setActionLoading('pdf')
    try {
      await captureRaportAsPdf(raportHtml, 'raport.pdf')
    } catch (err) {
      // User-facing banner is set below; log the cause for diagnosis.
      console.error('[ReportPage] capture raport PDF failed', err)
      setDownloadError(t('parent.report.pdfError'))
    } finally {
      setActionLoading(null)
    }
  }

  /* ── PNG download ── */
  const handleDownloadPng = async () => {
    if (!raportHtml) return
    setActionLoading('png')
    try {
      const blob = await captureRaportAsBlob(raportHtml)
      downloadBlob(blob, 'raport.png')
    } catch (err) {
      // User-facing banner is set below; log the cause for diagnosis.
      console.error('[ReportPage] capture raport PNG failed', err)
      setDownloadError(t('parent.report.pngError'))
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
          <p className="mt-4 text-sm text-on-surface-variant">{t('parent.report.loading')}</p>
        </div>
      </div>
    )
  }

  /* ── Error ── */
  if (guardError || error || !report || !raportHtml) {
    return (
      <div className="min-h-screen bg-gray-200 py-8">
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title={t('parent.report.unavailableTitle')}
          description={
            guardError === 'INVALID'
              ? t('parent.report.invalidLink')
              : guardError === 'EXPIRED'
                ? t('parent.report.expiredMsg')
                : error || t('parent.report.loadFailedMsg')
          }
        />
      </div>
    )
  }

  /* ── Render: fixed-width A4 sheet inside the zoom/pan viewport ── */
  return (
    <div className="relative min-h-screen bg-gray-200 print-report">
      <RaportZoomPan sheetWidth={A4_SHEET_WIDTH}>
        <div style={{ width: '21cm', height: iframeHeight || 'auto' }}>
          <iframe
            ref={iframeRef}
            srcDoc={raportHtml}
            title={t('parent.report.iframeTitle')}
            onLoad={handleIframeLoad}
            className="border-0 block"
            style={{ width: '21cm', border: 'none' }}
          />
        </div>
      </RaportZoomPan>

      {downloadError && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2 shadow-lg no-print">
          {downloadError}
        </div>
      )}

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-surface rounded-2xl p-3 border border-outline-variant shadow-lg no-print">
        <Button variant="secondary" size="sm" onClick={handleCetak}>
          <Printer className="w-4 h-4 mr-1" /> {t('parent.report.print')}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDownloadPdf} disabled={!!actionLoading}>
          {actionLoading === 'pdf' ? (
            <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> {t('common.processing')}</>
          ) : (
            <><FileText className="w-4 h-4 mr-1" /> {t('parent.report.downloadPdf')}</>
          )}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDownloadPng} disabled={!!actionLoading}>
          {actionLoading === 'png' ? (
            <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> {t('common.processing')}</>
          ) : (
            <><Camera className="w-4 h-4 mr-1" /> {t('parent.report.downloadPng')}</>
          )}
        </Button>
      </div>
    </div>
  )
}

/* ── Page wrapper ── */
const ReportPage = () => {
  return (
    <ParentTokenGuard kind="report">
      <ReportView />
    </ParentTokenGuard>
  )
}

export default ReportPage

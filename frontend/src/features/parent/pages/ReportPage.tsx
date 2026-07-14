import { useEffect, useState, useRef } from 'react'
import { FileText, Printer, Camera } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { Loader2 } from 'lucide-react'
import {
  ParentTokenGuard,
  useParentToken,
  type PublicReport,
} from '../../../shared/components/auth/ParentTokenGuard'
import { generateMiniRaportHTML } from '../../../shared/templates/miniRaport'
import { captureRaportAsPdf, captureRaportAsBlob, downloadBlob } from '../../../core/utils/raportCapture'
import { DEFAULT_FACILITATOR_MESSAGE, DEFAULT_FACILITATOR_NAME, A4_SHEET_WIDTH } from '../../../core/constants/report'
import { extractFirstSentence } from '../../../core/utils/reportNarrative'

/* ── Inner report component ── */
function ReportView() {
  const { report, loading: guardLoading, error: guardError } = useParentToken()

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
    if (!report) return

    const pub = report as PublicReport

    const buildHtml = () => {
      // The public report payload is an anti-IDOR view: it exposes the final
      // narrative, the mission id list, and the (optional) PDF url — never PII.
      const narrative = pub.ai_narrative_final || ''
      const missions: string[] = pub.mission_ids_json
        ? parseMissionIds(pub.mission_ids_json)
        : []

      return generateMiniRaportHTML({
        childName: 'Ananda',
        childAge: 0,
        sessionDate: '',
        photoUrl: undefined,
        quote: extractFirstSentence(narrative),
        stages: [],
        narrative,
        facilitatorMessage: DEFAULT_FACILITATOR_MESSAGE,
        missions,
        facilitatorName: DEFAULT_FACILITATOR_NAME,
        facilitatorPhotoUrl: undefined,
      })
    }

    try {
      setRaportHtml(buildHtml())
    } catch (err) {
      console.error('Failed to build parent report:', err)
      setError('Gagal memuat laporan.')
    } finally {
      setLoading(false)
    }
  }, [report])

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
      console.error('Failed to generate PDF:', err)
      setDownloadError('Gagal menghasilkan file PDF.')
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
  if (guardError || error || !report || !raportHtml) {
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

/* Parse the report's mission_ids_json field, which is a JSON array of ids as a
   string (backend RawJSON). Returns trimmed ids, tolerating non-JSON input. */
function parseMissionIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((m) => String(m).trim()).filter(Boolean)
    }
    if (typeof parsed === 'string') {
      return parsed.split(',').map((s) => s.trim()).filter(Boolean)
    }
  } catch {
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
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

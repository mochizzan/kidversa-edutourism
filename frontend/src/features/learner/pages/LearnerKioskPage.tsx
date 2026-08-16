import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Volume2, VolumeX, SkipForward, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { ContentRenderer } from '../components/ContentRenderer'
import { ApiError, getApiBaseUrl } from '../../../core/services/backendClient'
import { friendlyError } from '../../../core/utils/errorMessages'
import { API_ROUTES } from '../../../core/constants/apiRoutes'
import { kioskSessionPath } from '../../../core/constants/app'
import type { SessionStage, StageContent } from '../../../core/types'

/* ── Public kiosk payload (GET /api/sessions/:id/kiosk?token=) ──
   Mirrors the backend kioskResponse DTO: the session, its stages, and each
   stage's program contents. PII is intentionally excluded. */
interface KioskStageContent {
  stage: SessionStage
  contents: StageContent[]
}
interface KioskResponse {
  session: { id: string; name: string; session_date: string; location: string; status: string }
  stages: KioskStageContent[]
}

const LearnerKioskPage = () => {
  const navigate = useNavigate()
  const { sessionId, stageId } = useParams<{ sessionId: string; stageId?: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<SessionStage | null>(null)
  const [contents, setContents] = useState<StageContent[]>([])
  const [currentContentIndex, setCurrentContentIndex] = useState(0)
  const [isMuted, setIsMuted] = useState(false)

  const kioskRef = useRef<KioskResponse | null>(null)
  const inflightRef = useRef(false)
  const maxVisitedRef = useRef(0)

  const applyKiosk = (kiosk: KioskResponse) => {
    if (!sessionId) return
    // No stageId in the URL (e.g. /kiosk/session/:id) → jump to the first stage.
    if (!stageId) {
      const first = kiosk.stages[0]
      if (!first) {
        setError('Sesi ini belum memiliki konten.')
        return
      }
      navigate(`${kioskSessionPath(sessionId, first.stage.id)}?token=${encodeURIComponent(token)}`, { replace: true })
      return
    }

    const found = kiosk.stages.find((s) => s.stage.id === stageId)

    if (!found) {
      setError('Stage tidak ditemukan pada sesi ini.')
      setLoading(false)
      return
    }

    setStage(found.stage)
    const active = (found.contents ?? [])
      .filter((c) => c.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
    setContents(active)
  }

  useEffect(() => {
    if (!sessionId) {
      setError('Parameter tidak lengkap')
      setLoading(false)
      return
    }
    if (!token) {
      setError('Tautan kiosk tidak valid (token tidak ditemukan).')
      setLoading(false)
      return
    }

    const loadData = async () => {
      try {
        // Guard: if we already fetched this kiosk payload, reuse it instead of
        // re-fetching.
        if (kioskRef.current) {
          applyKiosk(kioskRef.current)
          return
        }
        // Guard: if a fetch for these params is already in flight (e.g. React
        // StrictMode double-invoke), let the first one finish; it sets kioskRef
        // and applies the result. Avoids a duplicate concurrent network call.
        if (inflightRef.current) return
        inflightRef.current = true
        // PUBLIC endpoint — the kiosk token (not a JWT) is the sole auth.
        const url = `${getApiBaseUrl()}${API_ROUTES.SESSIONS.KIOSK_ACCESS(sessionId)}?token=${encodeURIComponent(token)}`
        const res = await fetch(url, { credentials: 'omit' })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          const code = body?.error?.code ?? 'internal_error'
          throw new ApiError(body?.error?.message ?? 'Terjadi kesalahan', code, res.status)
        }
        const env = (await res.json()) as { data: KioskResponse }
        const kiosk = env.data
        kioskRef.current = kiosk
        applyKiosk(kiosk)
      } catch (err) {
        setError(friendlyError(err))
      } finally {
        inflightRef.current = false
        setLoading(false)
      }
    }

    loadData()
  }, [sessionId, stageId, token])

  const currentContent = contents[currentContentIndex]

  const goTo = (index: number) => {
    setCurrentContentIndex(index)
    maxVisitedRef.current = Math.max(maxVisitedRef.current, index)
  }

  const handleNext = () => {
    if (currentContentIndex < contents.length - 1) {
      goTo(currentContentIndex + 1)
    }
  }

  const handlePrevious = () => {
    if (currentContentIndex > 0) {
      goTo(currentContentIndex - 1)
    }
  }

  if (loading) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <p className="text-lg">Memuat konten...</p>
      </div>
    )
  }

  if (error || !stage) {
    return (
      <div className="h-screen w-screen bg-surface flex flex-col items-center justify-center text-on-surface p-8 text-center">
        <AlertTriangle className="w-16 h-16 text-warning mb-4" />
        <h1 className="text-xl font-bold mb-2">Konten Tidak Tersedia</h1>
        <p className="text-on-surface-variant">{error || 'Stage tidak ditemukan'}</p>
      </div>
    )
  }

  if (contents.length === 0) {
    return (
      <div className="h-screen w-screen bg-surface flex flex-col items-center justify-center text-on-surface p-8 text-center">
        <AlertTriangle className="w-16 h-16 text-warning mb-4" />
        <h1 className="text-xl font-bold mb-2">Belum Ada Konten</h1>
        <p className="text-on-surface-variant">Stage ini belum memiliki konten yang dapat ditampilkan.</p>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-black flex flex-col text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-black/80">
        <div>
          <p className="text-xs text-white/60">Stage {currentContentIndex + 1} dari {contents.length}</p>
          <h1 className="text-lg font-semibold">{currentContent?.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMuted(!isMuted)}
            className="text-white hover:bg-white/10"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex items-center justify-center bg-black">
        <ContentRenderer
          content={currentContent}
          isMuted={isMuted}
          onEnded={handleNext}
        />
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-center gap-4 px-6 py-4 bg-black/80">
        {currentContentIndex < maxVisitedRef.current && (
          <Button variant="secondary" size="lg" onClick={handlePrevious}>
            Sebelumnya
          </Button>
        )}
        {currentContentIndex < contents.length - 1 && (
          <Button
            variant="secondary"
            size="lg"
            onClick={handleNext}
            icon={<SkipForward className="w-5 h-5" />}
          >
            Selanjutnya
          </Button>
        )}
      </div>

      {/* Progress Indicators */}
      <div className="flex items-center justify-center gap-2 pb-4">
        {contents.map((_, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            className={`w-2 h-2 rounded-full transition-all ${
              index === currentContentIndex
                ? 'bg-primary w-6'
                : 'bg-white/30 hover:bg-white/50'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

export default LearnerKioskPage

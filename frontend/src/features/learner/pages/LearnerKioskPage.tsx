import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Volume2, VolumeX, SkipForward, AlertTriangle, Loader2, Lock } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { ContentRenderer } from '../components/ContentRenderer'
import { ApiError, getApiBaseUrl } from '../../../core/services/backendClient'
import { friendlyError } from '../../../core/utils/errorMessages'
import { API_ROUTES } from '../../../core/constants/apiRoutes'
import { kioskSessionPath } from '../../../core/constants/app'
import type { SessionStage, SessionSubstage, StageContent } from '../../../core/types'

/* ── Public kiosk payload (GET /api/sessions/:id/kiosk?token=) ──
   P3+ shape: the session, its stages, and each stage's Kegiatan (substages),
   each carrying its own contents. P4 added session_substage leaves; legacy
   payloads without `substages` fall back to the stage-level `contents`. */
interface KioskSubstage {
  substage: SessionSubstage
  contents: StageContent[]
  locked?: boolean
}
interface KioskStage {
  stage: SessionStage
  substages: KioskSubstage[]
  contents?: StageContent[] // legacy fallback when substages is empty/absent
}
interface KioskResponse {
  session: { id: string; name: string; session_date: string; location: string; status: string }
  stages: KioskStage[]
  group_id?: string
}

const activeSorted = (contents: StageContent[] = []) =>
  contents.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order)

const LearnerKioskPage = () => {
  const navigate = useNavigate()
  const { groupId, sessionId, stageId, substageId } = useParams<{
    groupId?: string
    sessionId: string
    stageId?: string
    substageId?: string
  }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<SessionStage | null>(null)
  const [substage, setSubstage] = useState<SessionSubstage | null>(null)
  const [contents, setContents] = useState<StageContent[]>([])
  const [currentContentIndex, setCurrentContentIndex] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [locked, setLocked] = useState(false)

  const kioskRef = useRef<KioskResponse | null>(null)
  const inflightRef = useRef(false)
  const maxVisitedRef = useRef(0)

  // Resolve the contents for the requested (stage, substage). Falls back to the
  // legacy stage-level contents when the stage has no substages.
  const resolveStage = (
    kiosk: KioskResponse,
    reqStageId?: string,
    reqSubstageId?: string,
  ): { stage: KioskStage; substage: SessionSubstage | null; contents: StageContent[]; locked: boolean } | null => {
    const target = kiosk.stages.find((s) => s.stage.id === reqStageId) ?? kiosk.stages[0]
    if (!target) return null

    const hasSubstages = Array.isArray(target.substages) && target.substages.length > 0
    if (hasSubstages) {
      const sub =
        target.substages.find((x) => x.substage.id === reqSubstageId) ?? target.substages[0]
      return {
        stage: target,
        substage: sub.substage,
        contents: sub.locked ? [] : activeSorted(sub.contents),
        locked: !!sub.locked,
      }
    }
    // Legacy fallback: stage-level contents.
    return { stage: target, substage: null, contents: activeSorted(target.contents), locked: false }
  }

  const applyKiosk = (kiosk: KioskResponse) => {
    if (!sessionId) return

    // No stageId in the URL (e.g. /kiosk/session/:id) → jump to the first
    // stage's first Kegiatan (or stage contents when there are no substages).
    if (!stageId) {
      const first = kiosk.stages[0]
      if (!first) {
        setError('Sesi ini belum memiliki konten.')
        return
      }
      const firstSub = first.substages[0]?.substage.id
      navigate(kioskSessionPath(sessionId, first.stage.id, firstSub, groupId), { replace: true })
      return
    }

    const resolved = resolveStage(kiosk, stageId, substageId)
    if (!resolved) {
      setError('Topik tidak ditemukan pada sesi ini.')
      setLoading(false)
      return
    }

    setLocked(!!resolved.locked)
    setStage(resolved.stage.stage)
    setSubstage(resolved.substage)
    setContents(resolved.contents)
  }

  const loadData = async () => {
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
    try {
      // Reuse an already-fetched payload instead of re-fetching.
      if (kioskRef.current) {
        applyKiosk(kioskRef.current)
        return
      }
      // Guard against concurrent fetches from StrictMode double-invoke.
      if (inflightRef.current) return
      inflightRef.current = true
      // PUBLIC endpoint — the kiosk token (not a JWT) is the sole auth.
      const url = `${getApiBaseUrl()}${API_ROUTES.SESSIONS.KIOSK_ACCESS(sessionId)}?token=${encodeURIComponent(token)}${groupId ? `&groupId=${encodeURIComponent(groupId)}` : ''}`
      const res = await fetch(url, {
        credentials: 'omit',
        // Bound the wait so a non-responsive backend surfaces an error
        // instead of an endless spinner.
        signal: AbortSignal.timeout(15000),
      })
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

  useEffect(() => {
    loadData()
  }, [sessionId, stageId, substageId, token])

  // Refresh the kiosk payload when the tab regains focus or becomes visible
  // again, so lock/unlock changes made by the facilitator are picked up live.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) {
        kioskRef.current = null
        loadData()
      }
    }
    const onFocus = () => {
      kioskRef.current = null
      loadData()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [loadData])

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
        <p className="text-on-surface-variant">{error || 'Topik tidak ditemukan'}</p>
      </div>
    )
  }

  if (locked) {
    return (
      <div className="h-screen w-screen bg-surface flex flex-col items-center justify-center text-on-surface p-8 text-center">
        <Lock className="w-16 h-16 text-warning mb-4" />
        <h1 className="text-xl font-bold mb-2">Konten Dikunci</h1>
        <p className="text-on-surface-variant">Kegiatan ini sedang dikunci oleh fasilitator. Silakan tunggu hingga dibuka kembali.</p>
      </div>
    )
  }

  if (contents.length === 0) {
    return (
      <div className="h-screen w-screen bg-surface flex flex-col items-center justify-center text-on-surface p-8 text-center">
        <AlertTriangle className="w-16 h-16 text-warning mb-4" />
        <h1 className="text-xl font-bold mb-2">Belum Ada Konten</h1>
        <p className="text-on-surface-variant">Kegiatan ini belum memiliki konten yang dapat ditampilkan.</p>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-black flex flex-col text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-black/80">
        <div>
          <p className="text-xs text-white/60">Konten {currentContentIndex + 1} dari {contents.length}</p>
          <h1 className="text-lg font-semibold">{currentContent?.title}</h1>
          {substage && <p className="text-xs text-white/50">{substage.status === 'COMPLETED' ? 'Kegiatan selesai' : 'Kegiatan berlangsung'}</p>}
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

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Play, Pause, Volume2, VolumeX, SkipForward, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '../shared/components/ui/Button'
import { sessionService } from '../core/services/sessions'
import { programService } from '../core/services/programs'
import type { SessionStage, StageContent } from '../core/types'
import { StageContentFileType } from '../core/types/enums'

const LearnerKioskPage = () => {
  const { sessionId, stageId } = useParams<{ sessionId: string; stageId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<SessionStage | null>(null)
  const [contents, setContents] = useState<StageContent[]>([])
  const [currentContentIndex, setCurrentContentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)

  useEffect(() => {
    if (!sessionId || !stageId) {
      setError('Parameter tidak lengkap')
      setLoading(false)
      return
    }

    const loadData = async () => {
      try {
        const stages = await sessionService.getStages(sessionId)
        const foundStage = stages.find((s) => s.id === stageId)
        
        if (!foundStage) {
          setError('Stage tidak ditemukan')
          setLoading(false)
          return
        }

        setStage(foundStage)

        const programStages = await programService.getStages(foundStage.program_stage_id.split('-')[0] || '')
        const programStage = programStages.find((ps) => ps.id === foundStage.program_stage_id)
        
        if (programStage) {
          const stageContents = await programService.getContents(programStage.id)
          const activeContents = stageContents.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order)
          setContents(activeContents)
        }
      } catch (err) {
        setError('Gagal memuat konten')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [sessionId, stageId])

  const currentContent = contents[currentContentIndex]

  const handleNext = () => {
    if (currentContentIndex < contents.length - 1) {
      setCurrentContentIndex(currentContentIndex + 1)
      setIsPlaying(false)
    }
  }

  const handlePrevious = () => {
    if (currentContentIndex > 0) {
      setCurrentContentIndex(currentContentIndex - 1)
      setIsPlaying(false)
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
        {currentContent?.file_type === StageContentFileType.VIDEO && (
          <video
            key={currentContent.id}
            src={currentContent.file_url}
            className="max-w-full max-h-full"
            autoPlay={isPlaying}
            muted={isMuted}
            controls
            onEnded={handleNext}
          />
        )}
        {currentContent?.file_type === StageContentFileType.IMAGE && (
          <img
            key={currentContent.id}
            src={currentContent.file_url}
            alt={currentContent.title}
            className="max-w-full max-h-full object-contain"
          />
        )}
        {currentContent?.file_type === StageContentFileType.AUDIO && (
          <div className="flex flex-col items-center gap-6">
            <div className="w-32 h-32 rounded-full bg-primary-container flex items-center justify-center">
              <Volume2 className="w-16 h-16 text-primary" />
            </div>
            <audio
              key={currentContent.id}
              src={currentContent.file_url}
              autoPlay={isPlaying}
              muted={isMuted}
              controls
              onEnded={handleNext}
            />
          </div>
        )}
        {currentContent?.file_type === StageContentFileType.GAME_BUNDLE && (
          <div className="w-full h-full flex items-center justify-center">
            <iframe
              key={currentContent.id}
              src={currentContent.file_url}
              className="w-full h-full border-0"
              title={currentContent.title}
              allow="fullscreen"
            />
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-center gap-4 px-6 py-4 bg-black/80">
        <Button
          variant="secondary"
          size="lg"
          onClick={handlePrevious}
          disabled={currentContentIndex === 0}
        >
          Sebelumnya
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={() => setIsPlaying(!isPlaying)}
          icon={isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={handleNext}
          disabled={currentContentIndex === contents.length - 1}
          icon={<SkipForward className="w-5 h-5" />}
        >
          Selanjutnya
        </Button>
      </div>

      {/* Progress Indicators */}
      <div className="flex items-center justify-center gap-2 pb-4">
        {contents.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentContentIndex(index)}
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

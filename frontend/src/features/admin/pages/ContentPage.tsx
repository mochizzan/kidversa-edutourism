import { useState, useEffect, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { Plus, Pencil, Trash2, Play, Image, Music, Gamepad2, Loader2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import { cn } from '../../../core/utils'
import type { StageContent, Program, ProgramStage } from '../../../core/types'
import { StageContentFileType } from '../../../core/types/enums'
import { YOUTUBE_LABEL } from '../../../core/constants/labels'
import { contentEditPath } from '../../../core/constants/app'
import { getContentThumbnailSrc } from '../../../core/utils/content'
import { getActiveTenantId } from '../../../core/utils/tenant'

// ── File type helpers ──

const FILE_TYPE_META: Record<StageContentFileType, { icon: ReactNode; label: string; bg: string; fg: string; ring: string }> = {
  VIDEO: { icon: <Play className="w-4 h-4" />, label: 'Video', bg: 'bg-blue-100', fg: 'text-blue-700', ring: 'ring-blue-200/50' },
  IMAGE: { icon: <Image className="w-4 h-4" />, label: 'Gambar', bg: 'bg-emerald-100', fg: 'text-emerald-700', ring: 'ring-emerald-200/50' },
  AUDIO: { icon: <Music className="w-4 h-4" />, label: 'Audio', bg: 'bg-amber-100', fg: 'text-amber-700', ring: 'ring-amber-200/50' },
  GAME_BUNDLE: { icon: <Gamepad2 className="w-4 h-4" />, label: 'Game', bg: 'bg-purple-100', fg: 'text-purple-700', ring: 'ring-purple-200/50' },
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return 'Langsung'
  if (seconds < 60) return `${seconds} detik`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m} menit ${s} detik` : `${m} menit`
}

// ── Component ──

const ContentPage = () => {
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()
  
  const [loading, setLoading] = useState(true)
  const [programs, setPrograms] = useState<Program[]>([])
  const [selectedProgram, setSelectedProgram] = useState('')
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [selectedStage, setSelectedStage] = useState('')
  const [contents, setContents] = useState<(StageContent & { stageName: string })[]>([])
  
  const [deleteContent, setDeleteContent] = useState<{id: string, stageId: string} | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Load programs
  useEffect(() => {
    programService.getAll({ limit: 100 }).then((res) => {
      setPrograms(res.data)
      if (res.data.length > 0) {
        setSelectedProgram(res.data[0].id)
      } else {
        setLoading(false)
      }
    })
  }, [])

  // Load contents for selected program
  useEffect(() => {
    if (!selectedProgram) {
      setStages([])
      setContents([])
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const stgs = await programService.getStages(selectedProgram)
        if (cancelled) return
        setStages(stgs)

        let allContents: (StageContent & { stageName: string })[] = []

        if (selectedStage) {
          const stageContents = await programService.getContents(selectedStage)
          if (cancelled) return
          const stageName = stgs.find((s) => s.id === selectedStage)?.name || ''
          allContents = stageContents.map((c) => ({ ...c, stageName }))
        } else {
          const stageContentsArrays = await Promise.all(
            stgs.map((s) => programService.getContents(s.id).catch(() => []))
          )
          if (cancelled) return
          stgs.forEach((stage, i) => {
            allContents = [
              ...allContents,
              ...stageContentsArrays[i].map((c) => ({ ...c, stageName: stage.name })),
            ]
          })
        }

        setContents(allContents)
      } catch (error) {
        console.error('Failed to load contents', error)
        if (!cancelled) addToast({ type: 'error', message: 'Gagal memuat konten' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [selectedProgram, selectedStage, addToast])

  const handleProgramChange = (value: string) => {
    setSelectedProgram(value)
    setSelectedStage('')
  }

  const handleDelete = async () => {
    if (!deleteContent) return
    setDeleting(true)
    try {
      await programService.deleteContent(deleteContent.stageId, deleteContent.id)
      setContents((prev) => prev.filter((c) => c.id !== deleteContent.id))
      addToast({ type: 'success', message: 'Konten dihapus' })
    } catch {
      addToast({ type: 'error', message: 'Gagal menghapus konten' })
    } finally {
      setDeleting(false)
      setDeleteContent(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Manager"
        subtitle="Kelola konten stage: video, gambar, audio, game."
        actions={
          <Link to={ROUTES.ADMIN.CONTENT_NEW}>
            <Button icon={<Plus className="w-4 h-4" />}>
              Tambah Konten
            </Button>
          </Link>
        }
      />

      <div className="bg-surface-container-low p-4 rounded-2xl flex flex-col sm:flex-row gap-4 items-center">
        <div className="w-full sm:w-64">
          <Select
            label="Program"
            options={programs.map((p) => ({ value: p.id, label: p.name }))}
            value={selectedProgram}
            onChange={(e) => handleProgramChange(e.target.value)}
            placeholder="Semua Program"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select
            label="Stage"
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            placeholder="Semua Stage"
            disabled={!selectedProgram}
            hint={!selectedProgram ? 'Pilih program terlebih dahulu' : undefined}
          />
        </div>
        <div className="text-sm text-on-surface-variant ml-auto">
          {loading ? 'Memuat...' : `${contents.length} konten ditemukan`}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : contents.length === 0 ? (
        <EmptyState
          icon={<Image className="w-12 h-12" />}
          title="Belum ada konten"
          description={
            selectedStage
              ? 'Tidak ada konten di stage ini. Buat konten baru atau pilih stage lain.'
              : 'Pilih program lain atau buat konten baru.'
          }
            action={{ label: 'Tambah Konten', onClick: () => navigate(ROUTES.ADMIN.CONTENT_NEW) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {contents.map((item) => {
            const meta = FILE_TYPE_META[item.file_type] || FILE_TYPE_META.VIDEO
            const isYouTube = item.file_type === StageContentFileType.VIDEO && !!item.youtube_url
            const thumbnail = getContentThumbnailSrc(item, getActiveTenantId() ?? undefined)
            return (
              <Card key={item.id} padding="none" className="hover:shadow-md transition-shadow flex flex-col overflow-hidden">
                <div className="relative aspect-video bg-surface-container-high flex items-center justify-center overflow-hidden">
                  {thumbnail.type === 'image' && thumbnail.src ? (
                    <img
                      src={thumbnail.src}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : thumbnail.type === 'video' && thumbnail.src ? (
                    <video
                      src={thumbnail.src}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      muted
                    />
                  ) : (
                    <div className={cn('flex items-center justify-center w-12 h-12 rounded-full', meta.bg)}>
                      <span className={meta.fg}>{meta.icon}</span>
                    </div>
                  )}
                  <div className={cn('absolute top-2 left-2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ring-1', meta.bg, meta.fg, meta.ring)}>
                    {meta.icon}
                    {isYouTube ? YOUTUBE_LABEL : meta.label}
                  </div>
                  <Badge
                    variant={item.is_active ? 'success' : 'neutral'}
                    size="sm"
                    className="absolute top-2 right-2 !text-[10px] !px-1.5"
                  >
                    {item.is_active ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>

                <div className="p-4 flex flex-col flex-1 min-w-0">
                  <p className="font-medium text-on-surface truncate" title={item.title}>{item.title}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                    Stage: {item.stageName}
                  </p>
                  <p className="text-xs text-on-surface-variant/60 mt-0.5">
                    {isYouTube ? YOUTUBE_LABEL : formatDuration(item.duration_seconds)}
                  </p>

                  <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-outline-variant/20">
                    <Link to={contentEditPath(item.id)}>
                      <Button
                        variant="ghost" size="sm"
                        icon={<Pencil className="w-3.5 h-3.5" />}
                        tooltip="Edit"
                      />
                    </Link>
                    <Button
                      variant="ghost" size="sm"
                      icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                      tooltip="Hapus"
                      onClick={() => setDeleteContent({ id: item.id, stageId: item.program_stage_id })}
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={!!deleteContent} onClose={() => setDeleteContent(null)} title="Hapus Konten" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteContent(null)}>Batal</Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>Hapus</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">Apakah Anda yakin ingin menghapus konten ini?</p>
      </Modal>
    </div>
  )
}

export default ContentPage


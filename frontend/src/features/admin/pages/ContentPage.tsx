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
import type { StageContent, Program } from '../../../core/types'
import { StageContentFileType } from '../../../core/types/enums'

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
    if (!selectedProgram) return
    
    let cancelled = false

    const loadProgramContents = async () => {
      setLoading(true)
      try {
        const stages = await programService.getStages(selectedProgram)
        if (cancelled) return

        const stageContentsArrays = await Promise.all(
          stages.map((stage) => programService.getContents(stage.id).catch(() => []))
        )

        if (cancelled) return

        let allContents: (StageContent & { stageName: string })[] = []
        stages.forEach((stage, i) => {
          allContents = [
            ...allContents, 
            ...stageContentsArrays[i].map(c => ({ ...c, stageName: stage.name }))
          ]
        })
        
        setContents(allContents)
      } catch (error) {
        console.error('Failed to load contents', error)
        if (!cancelled) addToast({ type: 'error', message: 'Gagal memuat konten' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    
    loadProgramContents()
    return () => { cancelled = true }
  }, [selectedProgram, addToast])

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
            options={programs.map((p) => ({ value: p.id, label: p.name }))}
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
            placeholder="Pilih Program"
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
          description="Pilih program lain atau buat konten baru."
            action={{ label: 'Tambah Konten', onClick: () => navigate(ROUTES.ADMIN.CONTENT_NEW) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {contents.map((item) => {
            const meta = FILE_TYPE_META[item.file_type] || FILE_TYPE_META.VIDEO
            return (
              <Card key={item.id} padding="sm" className="hover:shadow-md transition-shadow flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ring-1', meta.bg, meta.fg, meta.ring)}>
                    {meta.icon}
                    {meta.label}
                  </div>
                  <Badge variant={item.is_active ? 'success' : 'neutral'} size="sm">
                    {item.is_active ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-on-surface truncate" title={item.title}>{item.title}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                    Stage: {item.stageName}
                  </p>
                  <p className="text-xs text-on-surface-variant/60 mt-0.5">
                    {formatDuration(item.duration_seconds)}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-outline-variant/20">
                  <Link to={`/admin/content/${item.id}/edit`}>
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


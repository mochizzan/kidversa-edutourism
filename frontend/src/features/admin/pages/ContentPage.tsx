import { useState, useEffect, type ReactNode } from 'react'
import { Upload, Plus, Pencil, Trash2, Play, Image, Music, Gamepad2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { programService } from '../../../core/services/programs'
import { cn } from '../../../core/utils'
import { StageContentFileType } from '../../../core/types/enums'

// ── Types ──

interface ContentItem {
  id: string
  title: string
  file_type: StageContentFileType
  duration_seconds: number
  sort_order: number
  stage_id: string
  is_active: boolean
}

interface ProgramWithStages {
  id: string
  name: string
  stages?: Array<{ id: string; name: string }>
}

// ── File type helpers ──

const FILE_TYPE_META: Record<StageContentFileType, { icon: ReactNode; label: string; bg: string; fg: string; ring: string }> = {
  VIDEO: { icon: <Play className="w-4 h-4" />, label: 'Video', bg: 'bg-blue-100', fg: 'text-blue-700', ring: 'ring-blue-200/50' },
  IMAGE: { icon: <Image className="w-4 h-4" />, label: 'Gambar', bg: 'bg-emerald-100', fg: 'text-emerald-700', ring: 'ring-emerald-200/50' },
  AUDIO: { icon: <Music className="w-4 h-4" />, label: 'Audio', bg: 'bg-amber-100', fg: 'text-amber-700', ring: 'ring-amber-200/50' },
  GAME_BUNDLE: { icon: <Gamepad2 className="w-4 h-4" />, label: 'Game', bg: 'bg-purple-100', fg: 'text-purple-700', ring: 'ring-purple-200/50' },
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'Langsung'
  if (seconds < 60) return `${seconds} detik`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m} menit ${s} detik` : `${m} menit`
}

// ── Component ──

const ContentPage = () => {
  const [contents, setContents] = useState<ContentItem[]>([
    { id: 'c-1', title: 'Intro Sapi', file_type: StageContentFileType.VIDEO, duration_seconds: 120, sort_order: 1, stage_id: 'ps-1', is_active: true },
    { id: 'c-2', title: 'Quiz Sapi', file_type: StageContentFileType.GAME_BUNDLE, duration_seconds: 0, sort_order: 2, stage_id: 'ps-1', is_active: true },
  ])
  const [stageMap, setStageMap] = useState<Record<string, string>>({})

  // Fetch programs to resolve stage_id → stage name
  useEffect(() => {
    programService.getAll({ limit: 100 }).then((res) => {
      const map: Record<string, string> = {}
      ;(res.data as unknown as ProgramWithStages[]).forEach((p) => {
        p.stages?.forEach((s) => { map[s.id] = s.name })
      })
      setStageMap(map)
    })
  }, [])

  // Edit / Delete state
  const [open, setOpen] = useState(false)
  const [editingContent, setEditingContent] = useState<ContentItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editFileType, setEditFileType] = useState<StageContentFileType>(StageContentFileType.VIDEO)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleEdit = () => {
    if (!editingContent) return
    setContents((prev) =>
      prev.map((c) =>
        c.id === editingContent.id ? { ...c, title: editTitle, file_type: editFileType } : c,
      ),
    )
    setEditingContent(null)
  }

  const handleDelete = () => {
    if (!deleteId) return
    setContents((prev) => prev.filter((c) => c.id !== deleteId))
    setDeleteId(null)
  }

  const fileTypeOptions = Object.entries(FILE_TYPE_META).map(([value, meta]) => ({
    value,
    label: meta.label,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Manager"
        subtitle="Kelola konten stage: video, gambar, audio, game."
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setOpen(true)}>
            Tambah Konten
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {contents.map((item) => {
          const meta = FILE_TYPE_META[item.file_type]
          return (
            <Card key={item.id} padding="sm" className="hover:shadow-md transition-shadow flex flex-col">
              {/* Header: icon + badge */}
              <div className="flex items-center justify-between mb-3">
                <div className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ring-1', meta.bg, meta.fg, meta.ring)}>
                  {meta.icon}
                  {meta.label}
                </div>
                <Badge variant={item.is_active ? 'success' : 'neutral'} size="sm">
                  {item.is_active ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-on-surface truncate">{item.title}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {stageMap[item.stage_id] || `Stage ${item.stage_id}`}
                </p>
                <p className="text-xs text-on-surface-variant/60 mt-0.5">
                  {formatDuration(item.duration_seconds)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-outline-variant/20">
                <Button
                  variant="ghost" size="sm"
                  icon={<Pencil className="w-3.5 h-3.5" />}
                  tooltip="Edit"
                  onClick={() => {
                    setEditingContent(item)
                    setEditTitle(item.title)
                    setEditFileType(item.file_type)
                  }}
                />
                <Button
                  variant="ghost" size="sm"
                  icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                  tooltip="Hapus"
                  onClick={() => setDeleteId(item.id)}
                />
              </div>
            </Card>
          )
        })}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Tambah Konten" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
          <Button onClick={() => setOpen(false)}>Upload</Button>
        </div>
      }>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); }}>
          <Input label="Judul Konten" required />
          <Select label="Tipe File" options={fileTypeOptions} />
          <div className="border-2 border-dashed border-outline-variant rounded-2xl p-8 text-center">
            <Upload className="w-8 h-8 text-on-surface-variant mx-auto mb-2" />
            <p className="text-sm text-on-surface-variant">Klik atau seret file ke sini</p>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingContent} onClose={() => setEditingContent(null)} title="Edit Konten" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditingContent(null)}>Batal</Button>
          <Button onClick={handleEdit}>Simpan</Button>
        </div>
      }>
        <div className="space-y-4">
          <Input label="Judul Konten" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
          <Select label="Tipe File" value={editFileType} onChange={(e) => setEditFileType(e.target.value as StageContentFileType)} options={fileTypeOptions} />
        </div>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Hapus Konten" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Batal</Button>
          <Button variant="danger" onClick={handleDelete}>Hapus</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">Apakah Anda yakin ingin menghapus konten ini?</p>
      </Modal>
    </div>
  )
}

export default ContentPage

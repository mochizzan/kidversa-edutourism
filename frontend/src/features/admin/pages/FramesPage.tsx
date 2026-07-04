import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Upload, Image, Pencil, Trash2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { frameService } from '../../../core/services/frames'
import { programService } from '../../../core/services/programs'
import { formatDate } from '../../../shared/utils'
import type { PhotoFrame, Program } from '../../../core/types'

// Module-level cache: persists across re-mounts so back-navigation is instant
let _frameCache: PhotoFrame[] = []

const FramesPage = () => {
  const [frames, setFrames] = useState<PhotoFrame[]>(_frameCache)
  const [programs, setPrograms] = useState<Program[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editingFrame, setEditingFrame] = useState<PhotoFrame | null>(null)
  const [editName, setEditName] = useState('')
  const [editProgramId, setEditProgramId] = useState('')

  const programMap = useMemo(
    () => new Map(programs.map((p) => [p.id, p.name])),
    [programs],
  )

  const load = async () => {
    const res = await frameService.getAll({ page: 1, limit: 100 })
    setFrames(res.data)
    _frameCache = res.data
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    programService.getAll({ limit: 100 }).then(res => setPrograms(res.data))
  }, [])

  const handleEdit = async () => {
    if (!editingFrame) return
    await frameService.update(editingFrame.id, { name: editName, program_id: editProgramId || undefined })
    setEditingFrame(null)
    load()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await frameService.deactivate(deleteId)
    setDeleteId(null)
    load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Frame Manager"
        subtitle="Kelola frame PNG untuk Smart Photo."
        actions={
          <Link to="/admin/frames/upload">
            <Button icon={<Upload className="w-4 h-4" />}>Upload Frame</Button>
          </Link>
        }
      />

      <div className="space-y-3">
        {frames.map((frame) => (
          <Card key={frame.id} padding="sm" className="hover:shadow-md transition-shadow">
            <div className="flex items-start gap-4">
              {/* Thumbnail */}
              <div className="relative w-20 h-16 shrink-0 rounded-xl bg-surface-container-high overflow-hidden flex items-center justify-center">
                {frame.thumbnail_url || frame.file_url ? (
                  <img src={frame.thumbnail_url || frame.file_url} alt={frame.name} className="w-full h-full object-cover" />
                ) : (
                  <Image className="w-6 h-6 text-on-surface-variant/30" />
                )}
                <Badge
                  variant={frame.is_active ? 'success' : 'neutral'}
                  size="sm"
                  className="absolute top-1 right-1 !text-[10px] !px-1.5"
                >
                  {frame.is_active ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-on-surface truncate">{frame.name}</p>
                <p className="text-sm text-on-surface-variant mt-0.5">
                  {programMap.get(frame.program_id ?? '') || 'Semua Program'}
                </p>
                <p className="text-xs text-on-surface-variant/60 mt-0.5">
                  Urutan ke-{frame.sort_order} · {formatDate(frame.created_at)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 self-center">
                <Button variant="ghost" size="sm" icon={<Pencil className="w-3.5 h-3.5" />} tooltip="Edit" onClick={() => { setEditingFrame(frame); setEditName(frame.name); setEditProgramId(frame.program_id || '') }} />
                <Button variant="ghost" size="sm" icon={<Trash2 className="w-3.5 h-3.5 text-error" />} tooltip="Hapus" onClick={() => setDeleteId(frame.id)} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!editingFrame} onClose={() => setEditingFrame(null)} title="Edit Frame" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditingFrame(null)}>Batal</Button>
          <Button onClick={handleEdit}>Simpan</Button>
        </div>
      }>
        <div className="space-y-4">
          <Input label="Nama Frame" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          <Select label="Program" value={editProgramId} onChange={(e) => setEditProgramId(e.target.value)} options={[
            { value: '', label: 'Semua Program' },
            ...programs.map(p => ({ value: p.id, label: p.name }))
          ]} />
        </div>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Hapus Frame" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Batal</Button>
          <Button variant="danger" onClick={handleDelete}>Hapus</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">Apakah Anda yakin ingin menghapus frame ini?</p>
      </Modal>
    </div>
  )
}

export default FramesPage

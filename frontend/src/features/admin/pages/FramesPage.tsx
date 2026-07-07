import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Image, Pencil, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useHighlight } from '../../../shared/hooks/useHighlight'
import { frameService } from '../../../core/services/frames'
import { programService } from '../../../core/services/programs'
import { formatDate } from '../../../shared/utils'
import type { PhotoFrame, Program } from '../../../core/types'

const FramesPage = () => {
  const navigate = useNavigate()
  const [frames, setFrames] = useState<PhotoFrame[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { getHighlightClass } = useHighlight()

  const programMap = useMemo(
    () => new Map(programs.map((p) => [p.id, p.name])),
    [programs],
  )

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await frameService.getAll({ page: 1, limit: 100 })
      setFrames(res.data)
    } catch {
      setError('Gagal memuat daftar frame. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    programService.getAll({ limit: 100 }).then(res => setPrograms(res.data))
  }, [])

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
          <Button icon={<Upload className="w-4 h-4" />} onClick={() => navigate('/admin/frames/upload')}>Upload Frame</Button>
        }
      />

      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-12 space-y-3">
            <AlertCircle className="w-10 h-10 mx-auto text-error" />
            <p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="secondary" size="sm" onClick={load}>Coba Lagi</Button>
          </div>
        ) : frames.length === 0 ? (
          <EmptyState
            icon={<Image className="w-12 h-12" />}
            title="Belum ada frame"
            description="Upload frame PNG untuk mulai menggunakan Smart Photo."
            action={{ label: 'Upload Frame', onClick: () => navigate('/admin/frames/upload') }}
          />
        ) : (
          frames.map((frame) => (
            <Card key={frame.id} padding="sm" className={`hover:shadow-md transition-shadow ${getHighlightClass(frame.id)}`}>
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
                  <Button variant="ghost" size="sm" icon={<Pencil className="w-3.5 h-3.5" />} tooltip="Edit" onClick={() => navigate(`/admin/frames/${frame.id}/edit`)} />
                  <Button variant="ghost" size="sm" icon={<Trash2 className="w-3.5 h-3.5 text-error" />} tooltip="Hapus" onClick={() => setDeleteId(frame.id)} />
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

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

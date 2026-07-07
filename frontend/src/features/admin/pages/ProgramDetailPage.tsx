import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge } from '../../../shared/components/ui/Badge'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Modal } from '../../../shared/components/ui/Modal'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import type { Program, ProgramStage, StageContent } from '../../../core/types'
import { StageContentFileType } from '../../../core/types/enums'
import { formatDate } from '../../../shared/utils'
import { ProgramCreateForm } from '../components/ProgramCreateForm'
import { ProgramInfoTab } from '../components/ProgramInfoTab'
import { ProgramStagesTab } from '../components/ProgramStagesTab'
import { StageFormModal } from '../components/StageFormModal'
import { Pencil, Trash2, Video, Image, Music, Gamepad2 } from 'lucide-react'

const contentTypeIcons: Record<string, React.ReactNode> = {
  VIDEO: <Video className="w-4 h-4" />,
  IMAGE: <Image className="w-4 h-4" />,
  AUDIO: <Music className="w-4 h-4" />,
  GAME_BUNDLE: <Gamepad2 className="w-4 h-4" />,
}

const ProgramDetailPage = () => {
  const { programId } = useParams<{ programId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()
  const isNew = programId === 'new'
  const [program, setProgram] = useState<Program | null>(null)
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [activeTab, setActiveTab] = useState('info')
  const [editingStage, setEditingStage] = useState<ProgramStage | null>(null)
  const [showStageForm, setShowStageForm] = useState(false)
  const [contentStage, setContentStage] = useState<ProgramStage | null>(null)
  const [stageContents, setStageContents] = useState<StageContent[]>([])
  const [contentsLoading, setContentsLoading] = useState(false)
  const [contentForm, setContentForm] = useState({ title: '', file_url: '', file_type: StageContentFileType.VIDEO, duration_seconds: 0, is_active: true })
  const [editingContentId, setEditingContentId] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!programId || isNew) return
    ;(async () => {
      setLoading(true)
      setProgram(await programService.getById(programId))
      setStages(await programService.getStages(programId))
      setLoading(false)
    })()
  }, [programId])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const created = await programService.create({ name: newName, description: newDesc })
      navigate(`/admin/programs/${created.id}`, { replace: true })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal membuat program' })
    } finally { setCreating(false) }
  }

  const handleSaveStage = async (data: Partial<ProgramStage>) => {
    if (!programId) return
    try {
      if (editingStage) {
        await programService.updateStage(programId, editingStage.id, data)
      } else {
        await programService.createStage(programId, {
          sequence_order: stages.length + 1, name: data.name || 'New Stage',
          description: data.description, content_type: data.content_type || 'VIDEO' as any,
          duration_minutes: data.duration_minutes || 12,
          is_recording_stage: data.is_recording_stage || false, is_photo_stage: data.is_photo_stage ?? true,
        })
      }
      setShowStageForm(false)
      setEditingStage(null)
      setStages(await programService.getStages(programId))
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menyimpan stage' })
    }
  }

  const handleDeleteStage = async (stageId: string) => {
    if (!programId) return
    try {
      await programService.deleteStage(programId, stageId)
      setStages(await programService.getStages(programId))
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menghapus stage' })
    }
  }

  const handleManageContent = async (stage: ProgramStage) => {
    setContentStage(stage)
    setContentsLoading(true)
    try {
      const contents = await programService.getContents(stage.id)
      setStageContents(contents)
    } catch {
      setStageContents([])
    } finally {
      setContentsLoading(false)
    }
    setContentForm({ title: '', file_url: '', file_type: StageContentFileType.VIDEO, duration_seconds: 0, is_active: true })
    setEditingContentId(null)
  }

  const handleSaveContent = async () => {
    if (!contentStage || !contentForm.title.trim() || !contentForm.file_url.trim()) return
    try {
      if (editingContentId) {
        await programService.updateContent(contentStage.id, editingContentId, contentForm)
      } else {
        await programService.createContent(contentStage.id, { ...contentForm, sort_order: stageContents.length })
      }
      const contents = await programService.getContents(contentStage.id)
      setStageContents(contents)
      setContentForm({ title: '', file_url: '', file_type: StageContentFileType.VIDEO, duration_seconds: 0, is_active: true })
      setEditingContentId(null)
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menyimpan konten' })
    }
  }

  const handleEditContent = (content: StageContent) => {
    setContentForm({
      title: content.title,
      file_url: content.file_url,
      file_type: content.file_type,
      duration_seconds: content.duration_seconds || 0,
      is_active: content.is_active,
    })
    setEditingContentId(content.id)
  }

  const handleDeleteContent = async (contentId: string) => {
    if (!contentStage) return
    try {
      await programService.deleteContent(contentStage.id, contentId)
      const contents = await programService.getContents(contentStage.id)
      setStageContents(contents)
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menghapus konten' })
    }
  }

  if (isNew) {
    return (
      <div className="space-y-6">
        <PageHeader title="Buat Program Baru" subtitle="Tambahkan program edutourism baru."
          breadcrumbs={[{ label: 'Programs', href: '/admin/programs' }, { label: 'Buat Baru' }]} />
        <Card>
          <ProgramCreateForm newName={newName} setNewName={setNewName} newDesc={newDesc} setNewDesc={setNewDesc}
            creating={creating} onCancel={() => navigate('/admin/programs')} onSubmit={handleCreate} />
        </Card>
      </div>
    )
  }

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (!program) return <div className="text-center text-on-surface-variant">Program not found</div>

  return (
    <div className="space-y-6">
      <PageHeader title={program.name} subtitle={`Dibuat ${formatDate(program.created_at)}`}
        breadcrumbs={[{ label: 'Programs', href: '/admin/programs' }, { label: program.name }]}
        actions={<Badge variant={program.is_active ? 'success' : 'neutral'}>{program.is_active ? 'Aktif' : 'Nonaktif'}</Badge>} />

      <Tabs tabs={[{ key: 'info', label: 'Info' }, { key: 'stages', label: `Stages (${stages.length})` }]}
        activeKey={activeTab} onChange={setActiveTab} />

      {activeTab === 'info' && <ProgramInfoTab program={program} />}
      {activeTab === 'stages' && (
        <ProgramStagesTab stages={stages}
          onAdd={() => { setEditingStage(null); setShowStageForm(true) }}
          onEdit={(stage) => { setEditingStage(stage); setShowStageForm(true) }}
          onDelete={handleDeleteStage}
          onManageContent={handleManageContent} />
      )}

      <StageFormModal open={showStageForm} editingStage={editingStage}
        onClose={() => { setShowStageForm(false); setEditingStage(null) }}
        onSubmit={handleSaveStage} />

      <Modal
        open={!!contentStage}
        onClose={() => { setContentStage(null); setStageContents([]) }}
        title={`Konten: ${contentStage?.name || ''}`}
        size="lg"
      >
        <div className="space-y-4">
          <div className="p-4 bg-surface-container-low rounded-xl space-y-3">
            <h4 className="text-sm font-semibold text-on-surface">
              {editingContentId ? 'Edit Konten' : 'Tambah Konten Baru'}
            </h4>
            <div className="grid gap-3">
              <Input
                label="Judul"
                value={contentForm.title}
                onChange={(e) => setContentForm({ ...contentForm, title: e.target.value })}
                placeholder="Judul konten"
              />
              <Input
                label="URL File"
                value={contentForm.file_url}
                onChange={(e) => setContentForm({ ...contentForm, file_url: e.target.value })}
                placeholder="https://..."
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant mb-1 block">Tipe File</label>
                <select
                  value={contentForm.file_type}
                  onChange={(e) => setContentForm({ ...contentForm, file_type: e.target.value as StageContentFileType })}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
                >
                  <option value={StageContentFileType.VIDEO}>Video</option>
                  <option value={StageContentFileType.IMAGE}>Gambar</option>
                  <option value={StageContentFileType.AUDIO}>Audio</option>
                  <option value={StageContentFileType.GAME_BUNDLE}>Game</option>
                </select>
                </div>
                <Input
                  label="Durasi (detik)"
                  type="number"
                  value={contentForm.duration_seconds.toString()}
                  onChange={(e) => setContentForm({ ...contentForm, duration_seconds: parseInt(e.target.value) || 0 })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={contentForm.is_active}
                  onChange={(e) => setContentForm({ ...contentForm, is_active: e.target.checked })}
                  className="rounded"
                />
                Aktif
              </label>
              <div className="flex gap-2">
                <Button onClick={handleSaveContent} size="sm">
                  {editingContentId ? 'Simpan' : 'Tambah'}
                </Button>
                {editingContentId && (
                  <Button variant="ghost" size="sm" onClick={() => {
                    setEditingContentId(null)
                    setContentForm({ title: '', file_url: '', file_type: StageContentFileType.VIDEO, duration_seconds: 0, is_active: true })
                  }}>
                    Batal
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-on-surface">Daftar Konten</h4>
            {contentsLoading ? (
              <p className="text-sm text-on-surface-variant">Memuat...</p>
            ) : stageContents.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Belum ada konten untuk stage ini.</p>
            ) : (
              <div className="space-y-2">
                {stageContents.map((content) => (
                  <div key={content.id} className="flex items-center justify-between p-3 bg-surface-variant rounded-lg">
                    <div className="flex items-center gap-3">
                      {contentTypeIcons[content.file_type]}
                      <div>
                        <p className="text-sm font-medium text-on-surface">{content.title}</p>
                        <p className="text-xs text-on-surface-variant">{content.file_type} · {content.duration_seconds}s</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} onClick={() => handleEditContent(content)} />
                      <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-error" />} onClick={() => handleDeleteContent(content.id)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ProgramDetailPage

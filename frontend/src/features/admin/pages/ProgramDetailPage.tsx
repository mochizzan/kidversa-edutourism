import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { programService } from '../../../core/services/programs'
import type { Program, ProgramStage, ContentType } from '../../../core/types'
import { ContentType as ContentTypeEnum } from '../../../core/types'
import { formatDate } from '../../../shared/utils'

const contentTypes = [
  { value: ContentTypeEnum.VIDEO, label: 'Video' },
  { value: ContentTypeEnum.SLIDESHOW, label: 'Slideshow' },
  { value: ContentTypeEnum.GAME, label: 'Game' },
  { value: ContentTypeEnum.MIXED, label: 'Mixed' },
]

const ProgramDetailPage = () => {
  const { programId } = useParams<{ programId: string }>()
  const [program, setProgram] = useState<Program | null>(null)
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('info')
  const [editingStage, setEditingStage] = useState<ProgramStage | null>(null)
  const [showStageForm, setShowStageForm] = useState(false)

  useEffect(() => {
    if (!programId) return
    ;(async () => {
      setLoading(true)
      const p = await programService.getById(programId)
      setProgram(p)
      const s = await programService.getStages(programId)
      setStages(s)
      setLoading(false)
    })()
  }, [programId])

  const handleSaveStage = async (data: Partial<ProgramStage>) => {
    if (!programId) return
    if (editingStage) {
      await programService.updateStage(programId, editingStage.id, data)
    } else {
      await programService.createStage(programId, {
        sequence_order: stages.length + 1,
        name: data.name || 'New Stage',
        description: data.description,
        content_type: data.content_type || ContentTypeEnum.VIDEO,
        duration_minutes: data.duration_minutes || 12,
        is_recording_stage: data.is_recording_stage || false,
        is_photo_stage: data.is_photo_stage ?? true,
      })
    }
    setShowStageForm(false)
    setEditingStage(null)
    const s = await programService.getStages(programId)
    setStages(s)
  }

  const handleDeleteStage = async (stageId: string) => {
    if (!programId) return
    await programService.deleteStage(programId, stageId)
    const s = await programService.getStages(programId)
    setStages(s)
  }

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (!program) return <div className="text-center text-on-surface-variant">Program not found</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title={program.name}
        subtitle={`Dibuat ${formatDate(program.created_at)}`}
        breadcrumbs={[
          { label: 'Programs', href: '/admin/programs' },
          { label: program.name },
        ]}
        actions={
          <Badge variant={program.is_active ? 'success' : 'neutral'}>{program.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
        }
      />

      <Tabs
        tabs={[
          { key: 'info', label: 'Info' },
          { key: 'stages', label: `Stages (${stages.length})` },
        ]}
        activeKey={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'info' && (
        <Card>
          <form className="space-y-4 max-w-2xl" onSubmit={(e) => { e.preventDefault(); }}>
            <Input label="Nama Program" defaultValue={program.name} />
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Deskripsi</label>
              <textarea
                defaultValue={program.description}
                className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
                rows={4}
              />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" defaultChecked={program.is_active} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
              <label htmlFor="active" className="text-sm text-on-surface">Program Aktif</label>
            </div>
            <div className="flex justify-end">
              <Button type="submit">Simpan Perubahan</Button>
            </div>
          </form>
        </Card>
      )}

      {activeTab === 'stages' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-on-surface">Daftar Stage</h3>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditingStage(null); setShowStageForm(true) }}>Tambah Stage</Button>
          </div>

          <div className="space-y-3">
            {stages.map((stage) => (
              <Card key={stage.id} className="hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-5 h-5 text-on-surface-variant/30" />
                    <div>
                      <p className="font-medium text-on-surface">{stage.name}</p>
                      <p className="text-sm text-on-surface-variant">{stage.description} · {stage.duration_minutes} menit</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="primary">{stage.content_type}</Badge>
                    {stage.is_recording_stage && <Badge variant="accent">Recording</Badge>}
                    {stage.is_photo_stage && <Badge variant="success">Photo</Badge>}
                    <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} tooltip="Edit Stage" onClick={() => { setEditingStage(stage); setShowStageForm(true) }} />
                    <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-error" />} tooltip="Hapus Stage" onClick={() => handleDeleteStage(stage.id)} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal open={showStageForm} onClose={() => { setShowStageForm(false); setEditingStage(null) }} title={editingStage ? 'Edit Stage' : 'Tambah Stage'} footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setShowStageForm(false); setEditingStage(null) }}>Batal</Button>
          <Button onClick={() => handleSaveStage(editingStage || {})}>Simpan</Button>
        </div>
      }>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.target as HTMLFormElement); const form = e.target as HTMLFormElement; handleSaveStage({
          name: fd.get('name') as string,
          description: fd.get('description') as string,
          content_type: fd.get('content_type') as ContentType,
          duration_minutes: Number(fd.get('duration_minutes')),
          is_recording_stage: form.querySelector<HTMLInputElement>('[name="is_recording_stage"]')?.checked ?? false,
          is_photo_stage: form.querySelector<HTMLInputElement>('[name="is_photo_stage"]')?.checked ?? false,
        })}}>
          <Input label="Nama Stage" name="name" required defaultValue={editingStage?.name} />
          <Input label="Deskripsi" name="description" defaultValue={editingStage?.description} />
          <Select label="Tipe Konten" name="content_type" options={contentTypes} defaultValue={editingStage?.content_type || ContentTypeEnum.VIDEO} />
          <Input label="Durasi (menit)" name="duration_minutes" type="number" min={1} max={60} defaultValue={editingStage?.duration_minutes || 12} />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-on-surface">
              <input type="checkbox" name="is_recording_stage" defaultChecked={editingStage?.is_recording_stage} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
              Recording Stage
            </label>
            <label className="flex items-center gap-2 text-sm text-on-surface">
              <input type="checkbox" name="is_photo_stage" defaultChecked={editingStage?.is_photo_stage ?? true} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
              Photo Stage
            </label>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default ProgramDetailPage

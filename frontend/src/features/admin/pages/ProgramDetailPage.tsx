import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge } from '../../../shared/components/ui/Badge'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { programService } from '../../../core/services/programs'
import type { Program, ProgramStage } from '../../../core/types'
import { formatDate } from '../../../shared/utils'
import { ProgramCreateForm } from '../components/ProgramCreateForm'
import { ProgramInfoTab } from '../components/ProgramInfoTab'
import { ProgramStagesTab } from '../components/ProgramStagesTab'
import { StageFormModal } from '../components/StageFormModal'

const ProgramDetailPage = () => {
  const { programId } = useParams<{ programId: string }>()
  const navigate = useNavigate()
  const isNew = programId === 'new'
  const [program, setProgram] = useState<Program | null>(null)
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [activeTab, setActiveTab] = useState('info')
  const [editingStage, setEditingStage] = useState<ProgramStage | null>(null)
  const [showStageForm, setShowStageForm] = useState(false)

  // Create form state
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
    } finally { setCreating(false) }
  }

  const handleSaveStage = async (data: Partial<ProgramStage>) => {
    if (!programId) return
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
  }

  const handleDeleteStage = async (stageId: string) => {
    if (!programId) return
    await programService.deleteStage(programId, stageId)
    setStages(await programService.getStages(programId))
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
          onDelete={handleDeleteStage} />
      )}

      <StageFormModal open={showStageForm} editingStage={editingStage}
        onClose={() => { setShowStageForm(false); setEditingStage(null) }}
        onSubmit={handleSaveStage} />
    </div>
  )
}

export default ProgramDetailPage

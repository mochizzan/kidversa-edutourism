import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge } from '../../../shared/components/ui/Badge'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import type { Program } from '../../../core/types'
import { formatDate } from '../../../shared/utils'
import { programListPath, programDetailPath, programStagePath } from '../../../core/constants/app'
import { friendlyError } from '../../../core/utils/errorMessages'
import { ProgramCreateForm } from '../components/ProgramCreateForm'
import { ProgramInfoTab } from '../components/ProgramInfoTab'
import { ProgramStagesTab } from '../components/ProgramStagesTab'

const ProgramDetailPage = () => {
  const { programId } = useParams<{ programId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()
  const isNew = programId === 'new'
  const [program, setProgram] = useState<Program | null>(null)
  const [stages, setStages] = useState<import('../../../core/types').ProgramStage[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [activeTab, setActiveTab] = useState('info')

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
      navigate(programDetailPath(created.id), { replace: true })
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally { setCreating(false) }
  }

  if (isNew) {
    return (
      <div className="space-y-6">
        <PageHeader title="Buat Program Baru" subtitle="Tambahkan program edutourism baru."
          breadcrumbs={[{ label: 'Programs', href: programListPath() }, { label: 'Buat Baru' }]} />
        <Card>
          <ProgramCreateForm newName={newName} setNewName={setNewName} newDesc={newDesc} setNewDesc={setNewDesc}
            creating={creating} onCancel={() => navigate(programListPath())} onSubmit={handleCreate} />
        </Card>
      </div>
    )
  }

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (!program) return <div className="text-center text-on-surface-variant">Program not found</div>

  return (
    <div className="space-y-6">
      <PageHeader title={program.name} subtitle={`Dibuat ${formatDate(program.created_at)}`}
        breadcrumbs={[{ label: 'Programs', href: programListPath() }, { label: program.name }]}
        actions={<Badge variant={program.is_active ? 'success' : 'neutral'}>{program.is_active ? 'Aktif' : 'Nonaktif'}</Badge>} />

      <Tabs tabs={[{ key: 'info', label: 'Info' }, { key: 'stages', label: `Stages (${stages.length})` }]}
        activeKey={activeTab} onChange={setActiveTab} />

      {activeTab === 'info' && <ProgramInfoTab program={program} />}
      {activeTab === 'stages' && (
        <ProgramStagesTab stages={stages}
          onAdd={() => navigate(programStagePath(program.id, 'new'))}
          onEdit={(stage) => navigate(programStagePath(program.id, stage.id))} />
      )}
    </div>
  )
}

export default ProgramDetailPage

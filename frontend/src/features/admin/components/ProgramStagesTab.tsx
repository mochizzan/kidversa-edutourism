import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import type { ProgramStage } from '../../../core/types'

interface ProgramStagesTabProps {
  stages: ProgramStage[]
  onAdd: () => void
  onEdit: (stage: ProgramStage) => void
  onDelete: (stageId: string) => void
}

export function ProgramStagesTab({ stages, onAdd, onEdit, onDelete }: ProgramStagesTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-on-surface">Daftar Stage</h3>
        <Button icon={<Plus className="w-4 h-4" />} onClick={onAdd}>Tambah Stage</Button>
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
                <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} tooltip="Edit Stage" onClick={() => onEdit(stage)} />
                <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-error" />} tooltip="Hapus Stage" onClick={() => onDelete(stage.id)} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

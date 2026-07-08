import { Card } from '../../../shared/components/ui/Card'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { Layers } from 'lucide-react'
import { sessionService } from '../../../core/services/sessions'
import type { SessionStage, User } from '../../../core/types'

interface SessionStagesTabProps {
  stages: SessionStage[]
  facilitators: User[]
  sessionId: string
  stageMap: Map<string, string>
}

export function SessionStagesTab({ stages, facilitators, sessionId, stageMap }: SessionStagesTabProps) {
  if (!stages || stages.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Layers className="w-12 h-12" />}
          title="Belum ada stage"
          description="Stage akan otomatis dibuat dari program saat sesi dibuat."
        />
      </Card>
    )
  }

  return (
    <Card>
      <div className="space-y-3">
        {stages.map((stage: SessionStage) => (
          <div key={stage.id} className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl">
            <div>
              <p className="font-medium text-on-surface">{stageMap.get(stage.program_stage_id) || stage.program_stage_id}</p>
              <p className="text-sm text-on-surface-variant">Status: {stage.status}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={stage.fasilitator_id || ''}
                onChange={(e) => sessionService.assignFacilitator(sessionId, stage.id, e.target.value)}
                className="rounded-xl border border-outline-variant px-3 py-1.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
              >
                <option value="">Pilih Fasilitator</option>
                {facilitators.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

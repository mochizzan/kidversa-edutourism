import { Card } from '../../../shared/components/ui/Card'
import { Badge } from '../../../shared/components/ui/Badge'
import { Select } from '../../../shared/components/ui/Select'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { Layers } from 'lucide-react'
import { useState, useEffect } from 'react'
import { sessionService } from '../../../core/services/sessions'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import type { SessionStage, User } from '../../../core/types'

interface SessionStagesTabProps {
  stages: SessionStage[]
  facilitators: User[]
  sessionId: string
  stageMap: Map<string, string>
  onRefresh: () => void
}

const stageStatusVariant: Record<string, 'neutral' | 'warning' | 'success'> = {
  LOCKED: 'neutral',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
}

const stageStatusLabel: Record<string, string> = {
  LOCKED: 'Terkunci',
  IN_PROGRESS: 'Berlangsung',
  COMPLETED: 'Selesai',
}

export function SessionStagesTab({ stages, facilitators, sessionId, stageMap, onRefresh }: SessionStagesTabProps) {
  const { addToast } = useGlobalToast()
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [facilitatorOverride, setFacilitatorOverride] = useState<Record<string, string | null>>({})

  useEffect(() => {
    setFacilitatorOverride((prev) => {
      const next = { ...prev }
      let changed = false
      for (const stage of stages) {
        if (stage.id in next && (next[stage.id] ?? null) === (stage.facilitator_id ?? null)) {
          delete next[stage.id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [stages])

  const handleAssign = async (stage: SessionStage, facilitatorId: string) => {
    const normalizedId = facilitatorId || null
    const previous = stage.id in facilitatorOverride
      ? facilitatorOverride[stage.id]
      : (stage.facilitator_id ?? null)
    if (normalizedId === previous) return

    setFacilitatorOverride((p) => ({ ...p, [stage.id]: normalizedId }))
    setPending((p) => ({ ...p, [stage.id]: true }))
    try {
      await sessionService.assignFacilitator(sessionId, stage.id, normalizedId)
      onRefresh()
    } catch (err) {
      setFacilitatorOverride((p) => ({ ...p, [stage.id]: previous }))
      addToast({ type: 'error', message: 'Gagal mengubah fasilitator. Silakan coba lagi.' })
    } finally {
      setPending((p) => ({ ...p, [stage.id]: false }))
    }
  }

  const facilitatorOptions = [
    { value: '', label: 'Belum ada fasilitator' },
    ...facilitators.map((f) => ({ value: f.id, label: f.name })),
  ]

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

  const assignedCount = stages.filter((s) => s.facilitator_id).length

  return (
    <div className="space-y-4">
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-on-surface-variant">
            Total stage: <span className="font-semibold text-on-surface">{stages.length}</span>
          </span>
          <span className="text-on-surface-variant">
            Fasilitator ditugaskan: <span className="font-semibold text-on-surface">{assignedCount}</span> / {stages.length}
          </span>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {stages.map((stage: SessionStage, index: number) => (
          <Card key={stage.id} padding="sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-container text-sm font-semibold text-on-primary-container">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-on-surface">
                    {stageMap.get(stage.program_stage_id) || stage.program_stage_id}
                  </p>
                  <div className="mt-1">
                    <Badge variant={stageStatusVariant[stage.status] || 'neutral'}>
                      {stageStatusLabel[stage.status] || stage.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="w-full sm:w-64 sm:shrink-0">
                <Select
                  value={(stage.id in facilitatorOverride ? facilitatorOverride[stage.id] : stage.facilitator_id) ?? ''}
                  options={facilitatorOptions}
                  disabled={pending[stage.id]}
                  onChange={(e) => handleAssign(stage, e.target.value)}
                  aria-label={`Fasilitator stage ${stageMap.get(stage.program_stage_id) || stage.program_stage_id}`}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

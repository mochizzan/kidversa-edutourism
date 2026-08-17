import { Card } from '../../../shared/components/ui/Card'
import { Badge } from '../../../shared/components/ui/Badge'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { Layers, User as UserIcon } from 'lucide-react'
import type { SessionStage, SessionGroup, User } from '../../../core/types'

interface SessionStagesTabProps {
  stages: SessionStage[]
  groups: SessionGroup[]
  facilitators: User[]
  sessionId: string
  stageMap: Map<string, string>
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

// Opsi A: stage facilitator is derived from the group(s) currently at the stage
// (group.facilitator_id is the single source of truth). Stage facilitator is
// read-only — assignment happens via the Groups tab, not per stage.
export function SessionStagesTab({ stages, groups, facilitators, stageMap }: SessionStagesTabProps) {
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
    <div className="flex flex-col gap-3">
      {stages.map((stage: SessionStage, index: number) => {
        // Opsi A: a group contributes its facilitator to a stage when it is
        // currently at that stage (current_session_stage_id set via Jump). A
        // group assigned a facilitator but not yet jumped (WAITING, field NULL)
        // belongs to the FIRST stage, so the assignment is visible immediately.
        const isFirstStage = index === 0
        const atStageIds = Array.from(
          new Set(
            groups
              .filter((g) => g.current_session_stage_id === stage.id)
              .map((g) => g.facilitator_id)
              .filter((id): id is string => !!id),
          ),
        )
        const waitingIds = isFirstStage
          ? Array.from(
              new Set(
                groups
                  .filter((g) => !g.current_session_stage_id)
                  .map((g) => g.facilitator_id)
                  .filter((id): id is string => !!id),
              ),
            )
          : []
        const facilitatorIds = Array.from(new Set([...atStageIds, ...waitingIds]))
        const waitingIdSet = new Set(waitingIds)
          return (
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

                <div className="w-full sm:w-72 sm:shrink-0">
                  {facilitatorIds.length === 0 ? (
                    <span className="text-sm text-on-surface-variant">
                      Belum ada fasilitator
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {facilitatorIds.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 text-sm text-on-surface"
                        >
                          <UserIcon className="w-3.5 h-3.5 text-on-surface-variant" />
                          {facilitators.find((f) => f.id === id)?.name ?? 'Belum ada fasilitator'}
                          {isFirstStage && waitingIdSet.has(id) && (
                            <span className="text-xs text-on-surface-variant">
                              (belum di-jump)
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
  )
}

export default SessionStagesTab

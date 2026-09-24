import { Card } from '../../../shared/components/ui/Card'
import { Badge } from '../../../shared/components/ui/Badge'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useTranslation } from 'react-i18next'
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

const stageStatusKeys = {
  LOCKED: 'admin.sessions.stageLocked',
  IN_PROGRESS: 'admin.sessions.stageInProgress',
  COMPLETED: 'common.done',
} as const satisfies Record<string, string>

// Opsi A: stage facilitator is derived from the group(s) currently at the stage
// (group.facilitator_id is the single source of truth). Stage facilitator is
// read-only — assignment happens via the Groups tab, not per stage.
export function SessionStagesTab({ stages, groups, facilitators, stageMap }: SessionStagesTabProps) {
  const { t } = useTranslation()
  if (!stages || stages.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Layers className="w-12 h-12" />}
          title={t('admin.topic.emptyTitle')}
          description={t('admin.sessions.stagesEmptyDesc')}
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
                      {t(stageStatusKeys[stage.status as keyof typeof stageStatusKeys] || stage.status)}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="w-full sm:w-72 sm:shrink-0">
                {facilitatorIds.length === 0 ? (
                  <span className="text-sm text-on-surface-variant">
                    {t('admin.sessions.noFacilitator')}
                  </span>
                ) : (
                  <div className="flex flex-col gap-1">
                    {facilitatorIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 text-sm text-on-surface"
                      >
                        <UserIcon className="w-3.5 h-3.5 text-on-surface-variant" />
                        {facilitators.find((f) => f.id === id)?.name ?? t('admin.sessions.noFacilitator')}
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

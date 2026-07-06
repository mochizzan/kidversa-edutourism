import { cn } from '../../../core/utils'
import { GroupStageProgressStatus } from '../../../core/types'

interface StageInfo {
  id: string
  name: string
  sequenceOrder: number
  status: GroupStageProgressStatus
}

interface StageProgressBarProps {
  stages: StageInfo[]
  className?: string
}

const dotColors: Record<GroupStageProgressStatus, string> = {
  [GroupStageProgressStatus.COMPLETED]: 'bg-green-500 border-green-500',
  [GroupStageProgressStatus.IN_PROGRESS]: 'bg-amber-400 border-amber-400 ring-2 ring-amber-200',
  [GroupStageProgressStatus.UNLOCKED]: 'bg-amber-300 border-amber-300',
  [GroupStageProgressStatus.LOCKED]: 'bg-gray-300 border-gray-300',
  [GroupStageProgressStatus.SKIPPED]: 'bg-red-400 border-red-400',
}

const lineColors: Record<GroupStageProgressStatus, string> = {
  [GroupStageProgressStatus.COMPLETED]: 'bg-green-500',
  [GroupStageProgressStatus.IN_PROGRESS]: 'bg-gray-300',
  [GroupStageProgressStatus.UNLOCKED]: 'bg-gray-300',
  [GroupStageProgressStatus.LOCKED]: 'bg-gray-300',
  [GroupStageProgressStatus.SKIPPED]: 'bg-red-400',
}

const labelColors: Record<GroupStageProgressStatus, string> = {
  [GroupStageProgressStatus.COMPLETED]: 'text-green-700',
  [GroupStageProgressStatus.IN_PROGRESS]: 'text-amber-700 font-medium',
  [GroupStageProgressStatus.UNLOCKED]: 'text-amber-600',
  [GroupStageProgressStatus.LOCKED]: 'text-gray-400',
  [GroupStageProgressStatus.SKIPPED]: 'text-red-500',
}

export function StageProgressBar({ stages, className }: StageProgressBarProps) {
  const sorted = [...stages].sort((a, b) => a.sequenceOrder - b.sequenceOrder)

  if (sorted.length === 0) {
    return null
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center">
        {sorted.map((stage, index) => {
          const isLast = index === sorted.length - 1
          return (
            <div key={stage.id} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5">
                {/* Dot */}
                <div
                  className={cn(
                    'w-3.5 h-3.5 rounded-full border-2 transition-colors shrink-0',
                    dotColors[stage.status]
                  )}
                />
                {/* Label below dot */}
                <span
                  className={cn(
                    'text-[10px] leading-tight text-center transition-colors',
                    labelColors[stage.status]
                  )}
                  title={stage.name}
                >
                  {stage.name}
                </span>
              </div>
              {/* Connecting line */}
              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mt-[-22px]',
                    lineColors[stage.status]
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

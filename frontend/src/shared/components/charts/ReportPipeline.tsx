import { ChevronRight } from 'lucide-react'
import { cn } from '../../../core/utils'
import { ReportStatus } from '../../../core/types/enums'
import { reportStatusLabel } from '../../../core/constants/reportStatus'

interface ReportPipelineStage {
  status: ReportStatus
  count: number
  color: string
}

interface ReportPipelineProps {
  data: ReportPipelineStage[]
  title?: string
}

const stageOrder: ReportStatus[] = [
  ReportStatus.DRAFT,
  ReportStatus.PENDING_REVIEW,
  ReportStatus.APPROVED,
  ReportStatus.SENT,
]

export function ReportPipeline({ data, title = 'Pipeline Laporan' }: ReportPipelineProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  const ordered = stageOrder.map((status) => {
    const found = data.find((d) => d.status === status)
    return {
      status,
      count: found?.count ?? 0,
      color: found?.color ?? 'bg-surface-variant',
    }
  })

  return (
    <div className="bg-surface rounded-3xl p-6 shadow-sm">
      <h2 className="text-lg font-bold text-on-surface mb-4">{title}</h2>
      {total === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">Belum ada laporan.</p>
      ) : (
        <div className="flex items-center gap-1">
          {ordered.map((stage, index) => {
            const pct = total > 0 ? (stage.count / total) * 100 : 0
            return (
              <div key={stage.status} className="flex-1 min-w-0">
                <div className="text-center">
                  <div
                    className={cn(
                      'rounded-t-lg py-2 px-3 transition-all duration-500',
                      stage.color,
                    )}
                    style={{ minHeight: '64px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <span className="text-2xl font-bold text-on-surface">{stage.count}</span>
                    <span className="text-[10px] text-on-surface-variant mt-0.5">
                      {reportStatusLabel[stage.status]}
                    </span>
                  </div>
                  <div className="mt-2 bg-surface-container-low rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: 'var(--color-primary)' }}
                    />
                  </div>
                  <span className="text-[10px] text-on-surface-variant mt-1 block">{pct.toFixed(0)}%</span>
                </div>
                {index < ordered.length - 1 && (
                  <div className="flex items-center justify-center -mt-6 z-10 relative">
                    <ChevronRight className="w-4 h-4 text-on-surface-variant" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

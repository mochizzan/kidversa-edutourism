import { Star } from 'lucide-react'
import { Card } from '../../../shared/components/ui/Card'
import { cn } from '../../../core/utils'
import type { StageInfo } from '../hooks/useReportReview'

interface ReportAssessmentScoresProps {
  stageInfos: StageInfo[]
}

export const ReportAssessmentScores = ({ stageInfos }: ReportAssessmentScoresProps) => (
  <Card title="Penilaian per Tahapan" subtitle="Skor bintang dan komentar dari fasilitator">
    {stageInfos.length === 0 ? (
      <p className="text-sm text-on-surface-variant py-4">Belum ada data tahapan untuk sesi ini.</p>
    ) : (
      <div className="space-y-4">
        {stageInfos.map(({ programStage, sessionStageId, assessment }) => (
          <div key={sessionStageId} className="p-4 rounded-xl bg-surface-container-low">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-on-surface text-sm">{programStage.name}</p>
              {assessment ? (
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={cn(
                        'w-4 h-4',
                        star <= assessment.star_rating
                          ? 'text-accent fill-accent'
                          : 'text-on-surface-variant/30',
                      )}
                    />
                  ))}
                </div>
              ) : (
                <span className="text-xs text-on-surface-variant">Belum dinilai</span>
              )}
            </div>
            {assessment?.comment && (
              <p className="text-sm text-on-surface-variant italic">
                &ldquo;{assessment.comment}&rdquo;
              </p>
            )}
            {!assessment && (
              <p className="text-xs text-yellow-600 no-print">Tidak ada penilaian untuk tahap ini</p>
            )}
          </div>
        ))}
      </div>
    )}
  </Card>
)

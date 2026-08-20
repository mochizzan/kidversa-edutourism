import { Star } from 'lucide-react'
import { Card } from '../../../shared/components/ui/Card'
import { cn } from '../../../core/utils'
import type { StageInfo } from '../hooks/useReportReview'

interface ReportAssessmentScoresProps {
  stageInfos: StageInfo[]
}

export const ReportAssessmentScores = ({ stageInfos }: ReportAssessmentScoresProps) => (
  <Card title="Penilaian per Topik" subtitle="Skor bintang dan komentar dari fasilitator">
    {stageInfos.length === 0 ? (
      <p className="text-sm text-on-surface-variant py-4">Belum ada data topik untuk sesi ini.</p>
    ) : (
      <div className="space-y-4">
        {stageInfos.map(({ programStage, sessionStageId, kegiatan }) => {
          const rated = kegiatan.filter((k) => k.assessment && k.assessment.star_rating >= 1).length
          return (
            <div key={sessionStageId} className="p-4 rounded-xl bg-surface-container-low">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-on-surface text-sm">{programStage.name}</p>
                <span className="text-xs text-on-surface-variant">
                  {rated}/{kegiatan.length} dinilai
                </span>
              </div>
              {kegiatan.length === 0 ? (
                <p className="text-xs text-on-surface-variant">Belum ada kegiatan untuk topik ini.</p>
              ) : (
                <div className="divide-y">
                  {kegiatan.map((k, idx) => (
                    <div key={idx} className="pl-3 border-l-2 border-surface-container-highest py-2 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm">{k.programSubstageName}</p>
                        {(() => {
                          const a = k.assessment
                          if (!a) {
                            return (
                              <span className="text-xs text-on-surface-variant">Belum dinilai</span>
                            )
                          }
                          if (a.star_rating >= 1) {
                            return (
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    className={cn(
                                      'w-4 h-4',
                                      star <= a.star_rating
                                        ? 'text-accent fill-accent'
                                        : 'text-on-surface-variant/30',
                                    )}
                                  />
                                ))}
                              </div>
                            )
                          }
                          return (
                            <span className="text-xs text-on-surface-variant">Tidak hadir</span>
                          )
                        })()}
                      </div>
                      {k.assessment?.comment && (
                        <p className="text-sm text-on-surface-variant italic">
                          &ldquo;{k.assessment.comment}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )}
  </Card>
)

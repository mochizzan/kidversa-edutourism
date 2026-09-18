import { Star } from 'lucide-react'
import { Card } from '../../../shared/components/ui/Card'
import { cn } from '../../../core/utils'
import { RATING_LABELS } from '../../../core/constants/assessment'
import type { StageInfo } from '../hooks/useReportReview'

interface ReportAssessmentScoresProps {
  stageInfos: StageInfo[]
}

const Stars = ({ rating, max = 4 }: { rating: number; max?: number }) => (
  <div className="flex items-center gap-0.5">
    {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
      <Star
        key={star}
        className={cn(
          'w-4 h-4',
          star <= rating ? 'text-accent fill-accent' : 'text-on-surface-variant/30',
        )}
      />
    ))}
  </div>
)

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
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-on-surface text-sm">{programStage.name}</p>
                <span className="text-xs text-on-surface-variant">
                  {rated}/{kegiatan.length} dinilai
                </span>
              </div>
              {kegiatan.length === 0 ? (
                <p className="text-xs text-on-surface-variant">Belum ada kegiatan untuk topik ini.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-surface-container-highest">
                        <th className="py-2 pr-3 font-medium text-on-surface-variant w-1/3">Kegiatan</th>
                        <th className="py-2 pr-3 font-medium text-on-surface-variant">Penilaian</th>
                        <th className="py-2 pr-3 font-medium text-on-surface-variant">Indikator</th>
                        <th className="py-2 pr-3 font-medium text-on-surface-variant">Komentar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container-highest">
                      {kegiatan.map((k, idx) => {
                        const a = k.assessment
                        return (
                          <tr key={idx}>
                            <td className="py-2 pr-3 text-on-surface">{k.programSubstageName}</td>
                            <td className="py-2 pr-3">
                              {!a ? (
                                <span className="text-xs text-on-surface-variant">Belum dinilai</span>
                              ) : a.star_rating >= 1 ? (
                                <Stars rating={a.star_rating} />
                              ) : (
                                <span className="text-xs text-on-surface-variant">Tidak hadir</span>
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              {!a ? (
                                <span className="text-on-surface-variant">—</span>
                              ) : (
                                <span className="text-on-surface-variant">
                                  {a.star_rating >= 1 ? RATING_LABELS[a.star_rating] : 'Tidak hadir'}
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              {a?.comment ? (
                                <p className="text-on-surface-variant italic">
                                  &ldquo;{a.comment}&rdquo;
                                </p>
                              ) : (
                                <span className="text-on-surface-variant">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )}
  </Card>
)

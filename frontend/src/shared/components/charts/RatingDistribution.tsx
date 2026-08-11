interface RatingDistributionProps {
  data: Array<{ rating: number; count: number }>
  title?: string
}

export function RatingDistribution({ data, title = 'Distribusi Penilaian' }: RatingDistributionProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="bg-surface rounded-3xl p-6 shadow-sm">
      <h2 className="text-lg font-bold text-on-surface mb-4">{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">Belum ada penilaian.</p>
      ) : (
        <div className="space-y-3">
          {data.map((item) => {
            const pct = (item.count / maxCount) * 100
            return (
              <div key={item.rating} className="flex items-center gap-3">
                <span className="text-xs text-on-surface-variant w-16 shrink-0">{item.rating} ★</span>
                <div className="flex-1 bg-surface-container-low rounded-full h-5 relative overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                  {item.count > 0 && (
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-on-surface">
                      {item.count}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between pt-2 border-t border-outline-variant/50">
            <span className="text-xs text-on-surface-variant">Total Penilaian</span>
            <span className="text-sm font-bold text-on-surface">
              {data.reduce((sum, d) => sum + d.count, 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

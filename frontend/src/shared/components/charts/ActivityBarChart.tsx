interface ActivityData {
  week: string
  count: number
}

interface ActivityBarChartProps {
  data: ActivityData[]
  title?: string
}

export function ActivityBarChart({ data, title = 'Aktivitas Mingguan' }: ActivityBarChartProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 60)

  return (
    <div className="bg-surface rounded-3xl p-6 shadow-sm">
      <h2 className="text-lg font-bold text-on-surface mb-4">{title}</h2>
      <div className="bg-surface-container-low rounded-2xl p-4 relative">
        <div className="absolute left-4 top-4 bottom-10 flex flex-col justify-between text-[10px] text-on-surface-variant font-medium">
          <span>{maxCount}</span>
          <span>{Math.round(maxCount * 0.66)}</span>
          <span>{Math.round(maxCount * 0.33)}</span>
          <span>0</span>
        </div>
        <div className="ml-6 flex items-end justify-between h-32 gap-3 pt-2">
          {data.map((item) => (
            <div key={item.week} className="flex-1 flex flex-col items-center gap-2">
              <div
                className="w-full bg-primary rounded-t-lg transition-all duration-500"
                style={{ height: `${(item.count / maxCount) * 100}%` }}
              />
              <span className="text-[10px] text-on-surface-variant">{item.week}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

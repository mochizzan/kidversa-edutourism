import {
 Bar,
 CartesianGrid,
 ComposedChart,
 Legend,
 Line,
 ResponsiveContainer,
 Tooltip,
 XAxis,
 YAxis,
} from 'recharts'

export interface TrendPoint {
 /** Date key YYYY-MM-DD (WIB). */
 date: string
 sessions: number
 registrations: number
 assessments: number
 /** Null on days without assessments. */
 avgRating: number | null
}

interface AnalyticsTrendChartProps {
 data: TrendPoint[]
 title?: string
 subtitle?: string
}

const seriesLabel: Record<string, string> = {
 sessions: 'Sesi',
 registrations: 'Pendaftar',
 assessments: 'Penilaian',
 avgRating: 'Rata-rata ★',
}

function formatDay(date: string): string {
 const [y, m, d] = date.split('-').map(Number)
 return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
 })
}

function formatAxisTick(date: string): string {
 return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}

interface TooltipRow {
 dataKey?: string
 value?: number | string | (number | string)[]
 color?: string
}

interface TrendTooltipProps {
 active?: boolean
 label?: string
 payload?: TooltipRow[]
}

function TrendTooltip({ active, label, payload }: TrendTooltipProps) {
 if (!active || !payload?.length || !label) return null
 return (
  <div className="rounded-xl bg-surface px-3 py-2 shadow-lg border border-outline-variant/50">
   <p className="text-xs font-semibold text-on-surface mb-1">{formatDay(label)}</p>
   {payload.map((row) => {
    const key = String(row.dataKey ?? '')
    const raw = Array.isArray(row.value) ? row.value[0] : row.value
    const value =
     key === 'avgRating'
      ? raw === null || raw === undefined
       ? 'Tidak ada penilaian'
       : `${Number(raw).toFixed(1)} ★`
      : `${Number(raw ?? 0)}`
    const unit = key === 'sessions' ? ' sesi' : key === 'registrations' ? ' pendaftar' : key === 'assessments' ? ' penilaian' : ''
    return (
     <p key={key} className="text-xs text-on-surface-variant flex items-center gap-2">
      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
      <span>
       {seriesLabel[key] ?? key}: <span className="font-medium text-on-surface">{value}</span>
       {unit}
      </span>
     </p>
    )
   })}
  </div>
 )
}

/**
 * Daily analytics trend: sessions held, new registrations, assessments
 * performed, and the average star rating per date — with hover tooltips.
 */
export function AnalyticsTrendChart({
 data,
 title = 'Tren Analitik Harian',
 subtitle = 'Sesi, pendaftar baru, dan penilaian per tanggal (WIB) — arahkan kursor untuk detail',
}: AnalyticsTrendChartProps) {
 return (
  <div className="bg-surface rounded-3xl p-6 shadow-sm">
   <h2 className="text-lg font-bold text-on-surface mb-1">{title}</h2>
   <p className="text-xs text-on-surface-variant mb-4">{subtitle}</p>
   <div className="h-72">
    <ResponsiveContainer width="100%" height="100%">
     <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" vertical={false} />
      <XAxis
       dataKey="date"
       tickFormatter={formatAxisTick}
       tick={{ fontSize: 10, fill: 'var(--color-on-surface-variant)' }}
       interval="preserveStartEnd"
       minTickGap={24}
       tickLine={false}
       axisLine={{ stroke: 'var(--color-outline-variant)' }}
      />
      <YAxis
       yAxisId="left"
       allowDecimals={false}
       tick={{ fontSize: 10, fill: 'var(--color-on-surface-variant)' }}
       tickLine={false}
       axisLine={false}
       width={40}
      />
      <YAxis
       yAxisId="right"
       orientation="right"
       domain={[0, 5]}
       ticks={[0, 1, 2, 3, 4, 5]}
       tickFormatter={(v: number) => `${v}★`}
       tick={{ fontSize: 10, fill: 'var(--color-on-surface-variant)' }}
       tickLine={false}
       axisLine={false}
       width={36}
      />
      <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--color-surface-container-low)' }} />
      <Legend
       formatter={(value) => seriesLabel[String(value)] ?? String(value)}
       iconType="circle"
       iconSize={8}
      />
      <Bar yAxisId="left" dataKey="sessions" name="Sesi" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      <Bar yAxisId="left" dataKey="registrations" name="Pendaftar" fill="var(--color-accent)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      <Line
       yAxisId="left"
       dataKey="assessments"
       name="Penilaian"
       type="monotone"
       stroke="var(--color-tertiary)"
       strokeWidth={2}
       dot={{ r: 2 }}
       activeDot={{ r: 4 }}
      />
      <Line
       yAxisId="right"
       dataKey="avgRating"
       name="Rata-rata ★"
       type="monotone"
       stroke="var(--color-secondary)"
       strokeWidth={2}
       strokeDasharray="5 4"
       dot={{ r: 2 }}
       activeDot={{ r: 4 }}
       connectNulls
      />
     </ComposedChart>
    </ResponsiveContainer>
   </div>
  </div>
 )
}

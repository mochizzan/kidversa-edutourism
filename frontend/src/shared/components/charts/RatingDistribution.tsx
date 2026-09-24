import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface RatingDistributionProps {
 data: Array<{ rating: number; count: number }>
 title?: string
 subtitle?: string
}

interface RatingTooltipProps {
 active?: boolean
 payload?: Array<{ payload?: { name?: string; count?: number; pct?: number } }>
}

function RatingTooltip({ active, payload }: RatingTooltipProps) {
 const { t } = useTranslation()
 const row = payload?.[0]?.payload
 if (!active || !row) return null
 return (
  <div className="rounded-xl bg-surface px-3 py-2 shadow-lg border border-outline-variant/50">
   <p className="text-xs font-semibold text-on-surface">{row.name}</p>
   <p className="text-xs text-on-surface-variant">
    {t('common.chart.ratingTooltip', { count: row.count, pct: row.pct?.toFixed(1) })}
   </p>
  </div>
 )
}

/**
 * Star-rating distribution (1–5) as a horizontal bar chart with hover
 * tooltips showing count and share of the filtered total.
 */
export function RatingDistribution({
 data,
 title,
 subtitle,
}: RatingDistributionProps) {
 const { t } = useTranslation()
 const total = data.reduce((sum, d) => sum + d.count, 0)
 const rows = data.map((d) => ({
  name: `${d.rating} ★`,
  count: d.count,
  pct: total > 0 ? (d.count / total) * 100 : 0,
 }))

 return (
  <div className="bg-surface rounded-3xl p-6 shadow-sm">
   <h2 className="text-lg font-bold text-on-surface mb-1">{title ?? t('common.chart.ratingTitle')}</h2>
   <p className="text-xs text-on-surface-variant mb-4">{subtitle ?? t('common.chart.ratingSubtitle')}</p>
   {total === 0 ? (
    <p className="text-sm text-on-surface-variant py-4">{t('common.chart.ratingEmpty')}</p>
   ) : (
    <>
     <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
       <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" horizontal={false} />
        <XAxis
         type="number"
         allowDecimals={false}
         tick={{ fontSize: 10, fill: 'var(--color-on-surface-variant)' }}
         tickLine={false}
         axisLine={{ stroke: 'var(--color-outline-variant)' }}
        />
        <YAxis
         type="category"
         dataKey="name"
         width={44}
         tick={{ fontSize: 11, fill: 'var(--color-on-surface-variant)' }}
         tickLine={false}
         axisLine={false}
        />
        <Tooltip content={<RatingTooltip />} cursor={{ fill: 'var(--color-surface-container-low)' }} />
        <Bar dataKey="count" name={t('common.chart.assessments')} fill="var(--color-primary)" radius={[0, 8, 8, 0]} barSize={18} />
       </BarChart>
      </ResponsiveContainer>
     </div>
     <div className="flex items-center justify-between pt-3 mt-2 border-t border-outline-variant/50">
      <span className="text-xs text-on-surface-variant">{t('common.chart.totalRating')}</span>
      <span className="text-sm font-bold text-on-surface">{total}</span>
     </div>
    </>
   )}
  </div>
 )
}

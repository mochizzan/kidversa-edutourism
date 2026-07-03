import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { cn } from '../../../core/utils'
import { CHART_PALETTE } from '../../../shared/constants/charts'

interface StageData {
  stageName: string
  averageRating: number
  totalAssessments: number
}

interface BarChartAverageProps {
  data: StageData[]
  title: string
  className?: string
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; payload: StageData }>
  label?: string
}) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="font-medium text-gray-900">{label}</p>
      <p className="text-sm text-gray-600 mt-1">
        Rata-rata: <span className="font-semibold">{data.averageRating.toFixed(1)}</span> / 5
      </p>
      <p className="text-sm text-gray-500">
        {data.totalAssessments} penilaian
      </p>
    </div>
  )
}

export function BarChartAverage({
  data,
  title,
  className,
}: BarChartAverageProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-gray-200 p-6',
        className
      )}
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="stageName"
            tick={{ fontSize: 12, fill: '#6B7280' }}
            axisLine={{ stroke: '#D1D5DB' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 5]}
            tick={{ fontSize: 12, fill: '#6B7280' }}
            axisLine={{ stroke: '#D1D5DB' }}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(91, 44, 141, 0.05)' }} />
          <Bar dataKey="averageRating" radius={[6, 6, 0, 0]} maxBarSize={60}>
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CHART_PALETTE[index % CHART_PALETTE.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

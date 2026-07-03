import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { cn } from '../../../core/utils'

interface RatingData {
  rating: number
  label: string
  count: number
  percentage: number
  color: string
}

interface PieChartDistributionProps {
  data: RatingData[]
  title: string
  className?: string
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: RatingData }>
}) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: data.color }}
        />
        <span className="font-medium text-gray-900">{data.label}</span>
      </div>
      <p className="text-sm text-gray-600">
        {data.count} peserta ({data.percentage}%)
      </p>
    </div>
  )
}

function CustomLegend({
  payload,
}: {
  payload?: Array<{ value: string; color: string; payload: RatingData }>
}) {
  if (!payload) return null

  return (
    <div className="flex flex-wrap justify-center gap-3 mt-4">
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-xs text-gray-600">{entry.payload.label}</span>
        </div>
      ))}
    </div>
  )
}

export function PieChartDistribution({
  data,
  title,
  className,
}: PieChartDistributionProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-gray-200 p-6',
        className
      )}
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>

      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
            dataKey="count"
            nameKey="label"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color}
                stroke="white"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

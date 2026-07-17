import { Pencil, Power, PowerOff } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import type { MissionBank } from '../../../core/types'

const CATEGORY_META: Record<string, { icon: string; color: string }> = {
  HOME: { icon: '🏠', color: 'bg-blue-100 text-blue-700' },
  PARENT: { icon: '👨‍👩‍👧', color: 'bg-purple-100 text-purple-700' },
  SCHOOL: { icon: '🏫', color: 'bg-amber-100 text-amber-700' },
}

interface MissionCardProps {
  mission: MissionBank
  onEdit: (mission: MissionBank) => void
  onToggleActive: (mission: MissionBank) => void
  onActivate: (mission: MissionBank) => void
}

export const MissionCard = ({ mission, onEdit, onToggleActive, onActivate }: MissionCardProps) => {
  const meta = CATEGORY_META[mission.category] || CATEGORY_META.HOME

  return (
    <div className="bg-surface rounded-2xl border border-outline-variant p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-2xl shrink-0">{meta.icon}</span>
          <div className="min-w-0">
            <h3 className="font-semibold text-on-surface truncate">{mission.title_child}</h3>
            <p className="text-sm text-on-surface-variant mt-0.5">{mission.title_parent}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={mission.is_active ? 'success' : 'neutral'}>
            {mission.is_active ? 'Aktif' : 'Nonaktif'}
          </Badge>
        </div>
      </div>

      {mission.description_parent && (
        <details className="mt-3 group">
          <summary className="text-xs text-primary cursor-pointer hover:text-primary-dark transition-colors">
            {mission.description_parent.length > 80 ? 'Lihat deskripsi' : 'Detail'}
          </summary>
          <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
            {mission.description_parent}
          </p>
        </details>
      )}

      {mission.related_stage_ids && mission.related_stage_ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {mission.related_stage_ids.map((stageId) => (
            <Badge key={stageId} variant="accent" size="sm">
              {`Stage ${stageId.slice(-4)}`}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-outline-variant">
        <Button
          variant="ghost"
          size="sm"
          icon={<Pencil className="w-4 h-4" />}
          onClick={() => onEdit(mission)}
        >
          Edit
        </Button>
        {mission.is_active ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<PowerOff className="w-4 h-4 text-warning" />}
            onClick={() => onToggleActive(mission)}
          >
            Nonaktifkan
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon={<Power className="w-4 h-4 text-green-600" />}
            onClick={() => onActivate(mission)}
          >
            Aktifkan
          </Button>
        )}
      </div>
    </div>
  )
}

import { Card } from '../../../shared/components/ui/Card'
import { cn } from '../../../core/utils'
import { MissionCategory } from '../../../core/types/enums'
import { missionCategoryLabels, missionCategoryIcons } from '../../../core/constants/report'
import type { MissionBank } from '../../../core/types'

interface ReportMissionSelectorProps {
  missions: MissionBank[]
  assignedMissionIds: string[]
  onToggleMission: (missionId: string) => void
}

export const ReportMissionSelector = ({
  missions,
  assignedMissionIds,
  onToggleMission,
}: ReportMissionSelectorProps) => (
  <Card title="Misi Lanjutan" subtitle="Pilih misi yang akan diberikan kepada orang tua">
    {missions.length === 0 ? (
      <p className="text-sm text-on-surface-variant py-4">
        Belum ada misi yang tersedia untuk program ini.
      </p>
    ) : (
      <div className="space-y-4">
        {[MissionCategory.HOME, MissionCategory.PARENT, MissionCategory.SCHOOL].map((cat) => {
          const catMissions = missions.filter((m) => m.category === cat)
          if (catMissions.length === 0) return null

          return (
            <div key={cat}>
              <p className="text-sm font-medium text-on-surface mb-2 flex items-center gap-2">
                <span>{missionCategoryIcons[cat]}</span>
                {missionCategoryLabels[cat]}
              </p>
              <div className="space-y-2">
                {catMissions.map((mission) => (
                  <label
                    key={mission.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors no-print',
                      assignedMissionIds.includes(mission.id)
                        ? 'bg-primary-container/30 border border-primary-container'
                        : 'bg-surface-variant hover:bg-surface-container border border-transparent',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={assignedMissionIds.includes(mission.id)}
                      onChange={() => onToggleMission(mission.id)}
                      className="mt-0.5 w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary-container"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface">{mission.title_child}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{mission.title_parent}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="hidden print:block mt-2">
                {catMissions
                  .filter((m) => assignedMissionIds.includes(m.id))
                  .map((mission) => (
                    <p key={mission.id} className="text-sm">
                      • {mission.title_child}
                    </p>
                  ))}
              </div>
            </div>
          )
        })}

        {assignedMissionIds.length > 0 && (
          <div className="text-xs text-on-surface-variant pt-2 border-t border-outline-variant no-print">
            {assignedMissionIds.length} misi dipilih
          </div>
        )}
      </div>
    )}
  </Card>
)

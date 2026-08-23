import { useState } from 'react'
import { Sparkles, Library, Loader2 } from 'lucide-react'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { cn } from '../../../core/utils'
import {
  MISSION_CATEGORY_META,
  MISSION_CATEGORY_ORDER,
} from '../../../core/constants/missionCategory'
import type { MissionBank } from '../../../core/types'

const MAX_MISSIONS = 4

interface ReportMissionSelectorProps {
  missions: MissionBank[]
  assignedMissionIds: string[]
  onToggleMission: (missionId: string) => void
  onSuggestMissions: () => void
  suggesting: boolean
}

export const ReportMissionSelector = ({
  missions,
  assignedMissionIds,
  onToggleMission,
  onSuggestMissions,
  suggesting,
}: ReportMissionSelectorProps) => {
  const [showLibrary, setShowLibrary] = useState(false)
  const atCapacity = assignedMissionIds.length >= MAX_MISSIONS

  return (
    <Card title="Misi Lanjutan" subtitle="Pilih maksimal 4 misi untuk diberikan kepada orang tua">
      <div className="flex flex-wrap items-center gap-2 no-print mb-4">
        <Button variant="secondary" size="sm" onClick={() => setShowLibrary(true)}>
          <Library className="w-4 h-4 mr-1" /> Pilih dari library misi
        </Button>
        <Button variant="secondary" size="sm" onClick={onSuggestMissions} disabled={suggesting}>
          {suggesting ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Memuat...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-1" /> Sesuaikan Misi - AI
            </>
          )}
        </Button>
        <span className="text-xs text-on-surface-variant ml-auto">
          {assignedMissionIds.length}/{MAX_MISSIONS} misi dipilih
        </span>
      </div>

      {missions.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">
          Belum ada misi yang tersedia untuk topik ini.
        </p>
      ) : (
        <div className="space-y-4">
          {MISSION_CATEGORY_ORDER.map((cat) => {
            const catMissions = missions.filter((m) => m.category === cat)
            if (catMissions.length === 0) return null

            const meta = MISSION_CATEGORY_META[cat]
            return (
              <div key={cat}>
                <p className="text-sm font-medium text-on-surface mb-2 flex items-center gap-2">
                  <span>{meta.emoji}</span>
                  {meta.label}
                </p>
                <div className="space-y-2">
                  {catMissions.map((mission) => {
                    const checked = assignedMissionIds.includes(mission.id)
                    const disabled = !checked && atCapacity
                    return (
                      <label
                        key={mission.id}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors no-print',
                          checked
                            ? 'bg-primary-container/30 border border-primary-container'
                            : 'bg-surface-variant hover:bg-surface-container border border-transparent',
                          disabled && 'opacity-50 cursor-not-allowed',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => onToggleMission(mission.id)}
                          className="mt-0.5 w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary-container"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-on-surface">{mission.title_child}</p>
                          <p className="text-xs text-on-surface-variant mt-0.5">
                            {mission.title_parent}
                          </p>
                        </div>
                      </label>
                    )
                  })}
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
        </div>
      )}

      <Modal
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        title="Pilih dari Library Misi"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowLibrary(false)}>
              Selesai
            </Button>
          </div>
        }
      >
        {missions.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Tidak ada misi untuk topik ini.</p>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {missions.map((mission) => {
              const checked = assignedMissionIds.includes(mission.id)
              const disabled = !checked && atCapacity
              return (
                <label
                  key={mission.id}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-xl cursor-pointer border',
                    checked
                      ? 'bg-primary-container/30 border-primary-container'
                      : 'bg-surface border-transparent hover:border-primary',
                    disabled && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggleMission(mission.id)}
                    className="mt-0.5 w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary-container"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface">{mission.title_child}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{mission.title_parent}</p>
                  </div>
                  <span className="text-xs text-on-surface-variant shrink-0">
                    {MISSION_CATEGORY_META[mission.category]?.emoji} {mission.category}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </Modal>
    </Card>
  )
}


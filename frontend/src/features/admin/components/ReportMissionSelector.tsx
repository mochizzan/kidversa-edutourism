import { useState } from 'react'
import { Sparkles, Library, Loader2 } from 'lucide-react'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { cn } from '../../../core/utils'
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
      {/* Action bar */}
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

      {/* Empty states */}
      {missions.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">
          Belum ada misi yang tersedia untuk topik ini.
        </p>
      ) : assignedMissionIds.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">
          Belum ada misi dipilih — pilih dari library atau gunakan saran AI.
        </p>
      ) : (
        <>
          {/* Selected missions as chips */}
          <div className="flex flex-wrap gap-2 no-print">
            {assignedMissionIds.map((id) => {
              const m = missions.find((x) => x.id === id)
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-container/30 border border-primary-container px-3 py-1 text-sm"
                >
                  {m?.title ?? id}
                  <button
                    type="button"
                    aria-label={`Hapus ${m?.title ?? id}`}
                    onClick={() => onToggleMission(id)}
                    className="ml-0.5 text-on-surface-variant hover:text-on-surface"
                  >
                    ✕
                  </button>
                </span>
              )
            })}
          </div>
          {/* Print: bullet list */}
          <div className="hidden print:block mt-2">
            {assignedMissionIds.map((id) => {
              const m = missions.find((x) => x.id === id)
              return (
                <p key={id} className="text-sm">
                  • {m?.title ?? id}
                </p>
              )
            })}
          </div>
        </>
      )}

      {/* Modal: single place to pick missions */}
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
                    <p className="text-sm font-medium text-on-surface">{mission.title}</p>
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </Modal>
    </Card>
  )
}

import { LayoutGrid, RotateCcw, Check } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import type { Participant } from '../../../core/types'

interface PhotoEditorProps {
  participant: Participant
  selectedFrameId: string | null
  isReportPhoto: boolean
  isSaving: boolean
  onOpenFramePicker: () => void
  onClearFrame: () => void
  onToggleReportPhoto: (checked: boolean) => void
  onRetake: () => void
  onSave: () => void
  onDiscard: () => void
}

export const PhotoEditor = ({
  participant,
  selectedFrameId,
  isReportPhoto,
  isSaving,
  onOpenFramePicker,
  onClearFrame,
  onToggleReportPhoto,
  onRetake,
  onSave,
  onDiscard,
}: PhotoEditorProps) => (
  <div className="bg-white border border-surface-container-highest rounded-3xl p-5 shadow-sm space-y-4 max-w-lg md:mx-auto">
    <div className="flex items-center justify-between">
      <button
        onClick={onOpenFramePicker}
        className="flex items-center gap-2 text-sm font-extrabold text-on-surface bg-surface-container-low hover:bg-surface-container-high px-4 py-2 rounded-xl transition-all"
      >
        <LayoutGrid className="w-4 h-4 text-primary" />
        {selectedFrameId ? 'Ganti Frame' : 'Pilih Frame'}
      </button>
      {selectedFrameId && (
        <button onClick={onClearFrame} className="text-xs font-bold text-error hover:underline">
          Hapus Frame
        </button>
      )}
    </div>

    <div className="flex items-center justify-between">
      <label className="flex items-center gap-2 text-sm font-bold text-on-surface cursor-pointer">
        <input
          type="checkbox"
          checked={isReportPhoto}
          onChange={(e) => onToggleReportPhoto(e.target.checked)}
          disabled={!participant.consent_photo}
          className="w-4 h-4 rounded accent-primary"
        />
        Jadikan Foto Raport
      </label>
      {!participant.consent_photo && (
        <span className="text-[10px] text-warning-text bg-warning-surface px-2 py-0.5 rounded-full font-bold">
          Izin foto belum diberikan
        </span>
      )}
    </div>

    <div className="flex items-center justify-center gap-4 pt-2">
      <Button
        variant="secondary"
        icon={<RotateCcw className="w-4 h-4" />}
        onClick={onRetake}
        className="w-full justify-center"
      >
        Ulang
      </Button>
      <Button
        loading={isSaving}
        icon={<Check className="w-4 h-4" />}
        onClick={onSave}
        className="w-full justify-center"
      >
        Simpan
      </Button>
      <Button variant="ghost" onClick={onDiscard} className="text-on-surface-variant">
        Batal
      </Button>
    </div>
  </div>
)

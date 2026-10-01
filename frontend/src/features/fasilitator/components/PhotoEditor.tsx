import type { ReactNode } from 'react'
import { FileCheck, Images, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/ui/Button'
import { Tooltip } from '../../../shared/components/ui/Tooltip'
import { cn } from '../../../core/utils'
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

interface CircleIconButtonProps {
 /** Accessible name AND tooltip content (icon-only control). */
 label: string
 icon: ReactNode
 disabled?: boolean
 /** Toggle state for the report-photo control; undefined = plain action button. */
 pressed?: boolean
 onClick: () => void
}

/**
 * Icon-only circular control for the vertical column over the canvas.
 * Native <button> so aria-label/aria-pressed land on the real button element
 * (the shared Button does not forward ARIA attributes).
 */
function CircleIconButton({ label, icon, disabled, pressed, onClick }: CircleIconButtonProps) {
 return (
  <Tooltip content={label}>
   <button
    type="button"
    aria-label={label}
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
    className={cn(
     'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
     'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
     'disabled:cursor-not-allowed disabled:opacity-50',
     pressed
      ? 'bg-primary text-on-primary hover:bg-primary-dark'
      : 'bg-white text-on-surface-variant hover:bg-surface-container-high',
    )}
   >
    {icon}
   </button>
  </Tooltip>
 )
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
}: PhotoEditorProps) => {
 const { t } = useTranslation()
 const frameLabel = selectedFrameId
  ? t('fasilitator.photos.changeFrame')
  : t('fasilitator.photos.chooseFrame')

 return (
  <>
   {/* Vertical icon column anchored to the page's relative editor wrapper. */}
   <div className="absolute right-2 top-2 z-10 flex flex-col items-center gap-2">
    <CircleIconButton
     label={frameLabel}
     icon={<Images className="h-5 w-5" aria-hidden="true" />}
     disabled={isSaving}
     onClick={onOpenFramePicker}
    />
    {selectedFrameId && (
     <CircleIconButton
      label={t('fasilitator.photos.deleteFrame')}
      icon={<Trash2 className="h-5 w-5" aria-hidden="true" />}
      disabled={isSaving}
      onClick={onClearFrame}
     />
    )}
    <CircleIconButton
     label={t('fasilitator.photos.setReportPhoto')}
     icon={<FileCheck className="h-5 w-5" aria-hidden="true" />}
     disabled={isSaving || !participant.consent_photo}
     pressed={isReportPhoto}
     onClick={() => onToggleReportPhoto(!isReportPhoto)}
    />
    <CircleIconButton
     label={t('fasilitator.photos.retake')}
     icon={<RotateCcw className="h-5 w-5" aria-hidden="true" />}
     disabled={isSaving}
     onClick={onRetake}
    />
    <CircleIconButton
     label={t('common.save')}
     icon={<Save className="h-5 w-5" aria-hidden="true" />}
     disabled={isSaving}
     onClick={onSave}
    />
   </div>

   {/* Card below the canvas: consent status (when missing) + labeled Batal. */}
   <div
    className={cn(
     'mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm',
     participant.consent_photo && 'justify-end',
    )}
   >
    {!participant.consent_photo && (
     <span className="rounded-full bg-warning-surface px-2 py-0.5 text-[10px] font-bold text-warning-text">
      {t('fasilitator.photos.consentRequired')}
     </span>
    )}
    <Button variant="secondary" onClick={onDiscard}>
     {t('common.cancel')}
    </Button>
   </div>
  </>
 )
}

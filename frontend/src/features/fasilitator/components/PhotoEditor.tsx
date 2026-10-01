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
   {/* Vertical icon column anchored to the page's relative editor wrapper,
       sitting in its right gutter — beside the canvas, never over it. */}
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

   {/* Footer below the canvas: consent status (when missing) above a
       centered capsule Batal — deliberately no card/panel wrapper. */}
   <div className="mt-3 flex flex-col items-center gap-2">
    {!participant.consent_photo && (
     <span className="rounded-full bg-warning-surface px-2 py-0.5 text-[10px] font-bold text-warning-text">
      {t('fasilitator.photos.consentRequired')}
     </span>
    )}
    <Button variant="secondary" className="rounded-full px-6" onClick={onDiscard}>
     {t('common.cancel')}
    </Button>
   </div>
  </>
 )
}

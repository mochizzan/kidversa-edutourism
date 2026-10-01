import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FlipHorizontal, LayoutGrid, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '../../../shared/components/ui/Tooltip'
import { cn } from '../../../core/utils'

interface CameraSettingsProps {
 /** The live camera stream gates the panel: no active preview, no toggles. */
 disabled: boolean
 showGrid: boolean
 mirror: boolean
 onToggleGrid: () => void
 onToggleMirror: () => void
}

interface ToggleRowProps {
 label: string
 icon: ReactNode
 checked: boolean
 onToggle: () => void
}

/** On/off switch row inside the settings panel (native switch semantics). */
function ToggleRow({ label, icon, checked, onToggle }: ToggleRowProps) {
 return (
  <button
   type="button"
   role="switch"
   aria-checked={checked}
   onClick={onToggle}
   className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-xs font-bold text-on-surface transition-colors hover:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary"
  >
   <span className="flex items-center gap-2">
    <span className={checked ? 'text-primary' : 'text-on-surface-variant'} aria-hidden="true">
     {icon}
    </span>
    {label}
   </span>
   <span
    aria-hidden="true"
    className={cn(
     'relative h-5 w-9 flex-shrink-0 rounded-full transition-colors',
     checked ? 'bg-primary' : 'bg-slate-200',
    )}
   >
    <span
     className={cn(
      'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
      checked && 'translate-x-4',
     )}
    />
   </span>
  </button>
 )
}

/**
 * Right-gear control for the camera phase. Anchored OUTSIDE the clipped
 * canvas box (the page wrapper reserves a right gutter), it opens a popover
 * with the Grid and Mirror toggles — the only remaining home of those two
 * controls after the in-canvas dropdown was trimmed to the device list.
 */
export const CameraSettings = ({
 disabled,
 showGrid,
 mirror,
 onToggleGrid,
 onToggleMirror,
}: CameraSettingsProps) => {
 const { t } = useTranslation()
 const [open, setOpen] = useState(false)
 const rootRef = useRef<HTMLDivElement>(null)
 const label = t('fasilitator.camera.settings')

 // A camera that stops mid-session must not leave a stale panel offering
 // toggles for a preview that no longer exists.
 useEffect(() => {
  if (disabled && open) setOpen(false)
 }, [disabled, open])

 useEffect(() => {
  if (!open) return
  const onKeyDown = (e: KeyboardEvent) => {
   if (e.key === 'Escape') setOpen(false)
  }
  document.addEventListener('keydown', onKeyDown)
  return () => document.removeEventListener('keydown', onKeyDown)
 }, [open])

 // Never swallow a failed interaction silently.
 const handleToggle = (toggle: () => void) => {
  try {
   toggle()
  } catch (error) {
   console.error('[CameraSettings] settings toggle failed', error)
  }
 }

 return (
  <div ref={rootRef} className="absolute right-2 top-2 z-20">
   <Tooltip content={disabled ? t('fasilitator.camera.settingsDisabled') : label}>
    <button
     type="button"
     aria-label={label}
     aria-haspopup="dialog"
     aria-expanded={open}
     aria-disabled={disabled}
     onClick={() => {
      if (disabled) return
      setOpen((v) => !v)
     }}
     className={cn(
      'flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md border shadow-lg transition-all',
      'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
      disabled
       ? 'cursor-not-allowed border-white/40 bg-white/50 text-on-surface-variant/60 opacity-70'
       : 'border-white/20 bg-white text-on-surface-variant hover:bg-surface-container-high',
     )}
    >
     <Settings className="h-5 w-5" aria-hidden="true" />
    </button>
   </Tooltip>

   {open && !disabled && (
    <>
     {/* Outside-click catcher — same pattern as the camera picker. */}
     <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
     <div
      role="dialog"
      aria-label={label}
      className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl z-50"
     >
      <ToggleRow
       label={t('fasilitator.camera.grid')}
       icon={<LayoutGrid className="h-4 w-4" />}
       checked={showGrid}
       onToggle={() => handleToggle(onToggleGrid)}
      />
      <ToggleRow
       label={t('fasilitator.camera.mirror')}
       icon={<FlipHorizontal className="h-4 w-4" />}
       checked={mirror}
       onToggle={() => handleToggle(onToggleMirror)}
      />
     </div>
    </>
   )}
  </div>
 )
}

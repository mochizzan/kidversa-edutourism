import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronUp } from 'lucide-react'
import { cn } from '../../../../core/utils'
import type { Toast, ToastType } from '../../../../core/types/toast'
import { MAX_VISIBLE_PER_GROUP, EXIT_TOTAL_MS, TOAST_CONFIG, TOAST_LABEL_KEYS } from './toastConfig'
import { ToastItem } from './ToastItem'

export interface ToastContainerProps {
 toasts: Toast[]
 onRemove: (id: string) => void
}

/**
 * Groups toasts by type so same-type toasts share a stack column.
 * Within a group the newest toast is index 0 (hence `unshift`).
 */
function buildGroups(toasts: Toast[]): Map<ToastType, Toast[]> {
 const groups = new Map<ToastType, Toast[]>()
 for (const toast of toasts) {
  const list = groups.get(toast.type) ?? []
  list.unshift(toast)
  groups.set(toast.type, list)
 }
 return groups
}

/**
 * Fixed overlay that lays out the toast stacks.
 *
 * Placement is responsive: mobile → top, full-width; desktop → bottom-right.
 * Groups are ordered newest-first, only the top MAX_VISIBLE_PER_GROUP items
 * render, and the remainder collapses into a "+N lainnya" badge. A global
 * Escape handler dismisses everything.
 */
export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
 const { t } = useTranslation()
 const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
 const containerRef = useRef<HTMLDivElement>(null)

 // Drop exiting ids once their nodes are actually gone from the DOM.
 useEffect(() => {
  if (exitingIds.size === 0) return
  const timer = setTimeout(() => {
   setExitingIds((prev) => {
    const container = containerRef.current
    if (!container) return prev
    const next = new Set(prev)
    for (const id of next) {
     if (!container.querySelector(`[data-toast-id="${id}"]`)) {
      next.delete(id)
     }
    }
    return next
   })
  }, EXIT_TOTAL_MS + 20)
  return () => clearTimeout(timer)
 }, [exitingIds, toasts])

 const groups = useMemo(() => buildGroups(toasts), [toasts])

 // Ids are time-prefixed (`toast-<ts>-<rand>`), so a descending lexicographic
 // compare on the newest id per group orders groups newest-first.
 const sortedGroups = useMemo(
  () =>
   Array.from(groups.entries()).sort((a, b) => {
    const aNewest = a[1][0]?.id ?? ''
    const bNewest = b[1][0]?.id ?? ''
    return bNewest.localeCompare(aNewest)
   }),
  [groups],
 )

 const handleStartExit = useCallback((id: string) => {
  setExitingIds((prev) => new Set(prev).add(id))
 }, [])

 // Global Escape: dismiss all.
 useEffect(() => {
  if (toasts.length === 0 && exitingIds.size === 0) return
  const handler = (e: KeyboardEvent) => {
   if (e.key === 'Escape') {
    const allIds = toasts.map((t) => t.id)
    setExitingIds((prev) => {
     const next = new Set(prev)
     for (const id of allIds) next.add(id)
     return next
    })
    setTimeout(() => {
     for (const t of toasts) onRemove(t.id)
     setExitingIds(new Set())
    }, EXIT_TOTAL_MS + 20)
   }
  }
  document.addEventListener('keydown', handler, true)
  return () => document.removeEventListener('keydown', handler, true)
 }, [toasts, exitingIds.size, onRemove])

 if (toasts.length === 0 && exitingIds.size === 0) return null

 return (
  <div
   ref={containerRef}
   className={cn(
    'fixed z-[100] flex flex-col gap-3 pointer-events-none',
    'top-3 left-3 right-3 flex-col-reverse',
    'sm:left-5 sm:right-5',
    'md:bottom-6 md:left-auto md:right-6 md:top-auto md:flex-row-reverse md:max-w-sm',
    '[&_>_div]:pointer-events-auto',
   )}
   role="region"
   aria-live="polite"
   aria-atomic="false"
   aria-relevant="additions removals"
   aria-label={t('common.toast.region')}
  >
   {sortedGroups.map(([type, items], groupIdx) => {
    const config = TOAST_CONFIG[type]
    const visible = items.slice(0, MAX_VISIBLE_PER_GROUP)
    const overflow = items.length - MAX_VISIBLE_PER_GROUP

    return (
     <div
      key={type}
      role="group"
      aria-roledescription={t('common.toast.groupRole')}
      aria-label={t('common.toast.groupAria', {
       label: t(TOAST_LABEL_KEYS[type]).toLowerCase(),
       count: items.length,
      })}
      aria-setsize={items.length}
      aria-posinset={0}
      className="flex flex-col-reverse gap-3 pointer-events-none"
      style={{ '--group-index': groupIdx } as CSSProperties}
     >
      {visible.map((toast, idx) => (
       <ToastItem
        key={toast.id}
        toast={toast}
        onRemove={onRemove}
        stackIndex={idx}
        groupIndex={groupIdx}
        isExiting={exitingIds.has(toast.id)}
        onStartExit={handleStartExit}
       />
      ))}

      {overflow > 0 && (
       <button
        type="button"
        aria-label={t('common.toast.overflowAria', {
         count: overflow,
         label: t(TOAST_LABEL_KEYS[type]).toLowerCase(),
        })}
        title={t('common.toast.overflowTitle', { count: overflow })}
        className={cn(
         'flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border text-xs font-semibold',
         'backdrop-blur-xl cursor-pointer pointer-events-auto',
         'hover:brightness-[0.96] active:scale-[0.97]',
         'transition-all duration-200 animate-toast-badge-pulse',
         config.bg,
         config.border,
         config.text,
        )}
       >
        <span
         className={cn(
          'flex items-center justify-center w-5 h-5 rounded-full',
          'text-[10px] font-bold text-white',
          config.badgeBg,
         )}
         aria-hidden="true"
        >
         {overflow > 9 ? '9+' : overflow}
        </span>
        <span>{t('common.toast.overflowText', { label: t(TOAST_LABEL_KEYS[type]).toLowerCase() })}</span>
        <ChevronUp className="w-3.5 h-3.5 opacity-50" aria-hidden="true" />
       </button>
      )}
     </div>
    )
   })}
  </div>
 )
}

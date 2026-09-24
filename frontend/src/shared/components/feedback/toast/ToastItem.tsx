import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Pause } from 'lucide-react'
import { cn } from '../../../../core/utils'
import type { Toast } from '../../../../core/types/toast'
import {
 DEFAULT_DURATION,
 SPRING_STAGGER_MS,
 SWIPE_THRESHOLD_PX,
 EXIT_SPRING_MS,
 EXIT_TOTAL_MS,
 TOAST_CONFIG,
 TOAST_LABEL_KEYS,
} from './toastConfig'

export interface ToastItemProps {
 toast: Toast
 onRemove: (id: string) => void
 stackIndex: number
 groupIndex: number
 isExiting: boolean
 onStartExit: (id: string) => void
}

/**
 * A single toast card.
 *
 * Countdown is driven by `requestAnimationFrame` (sub-frame accurate, cancelled
 * on unmount/exit) rather than a CSS animation, so hover/focus pause can hold
 * the remaining time. Exit is two-phase: spring-out (EXIT_SPRING_MS) then a
 * height collapse (EXIT_COLLAPSE_MS), after which the parent removes the item.
 *
 * A11y: role="alert" + aria-live="assertive" per item; the progress bar exposes
 * aria-valuenow/min/max; Escape on the close button dismisses this toast.
 */
export function ToastItem({
 toast,
 onRemove,
 stackIndex,
 groupIndex,
 isExiting,
 onStartExit,
}: ToastItemProps) {
 const { t } = useTranslation()
 const [paused, setPaused] = useState(false)
 const cardRef = useRef<HTMLDivElement>(null)
 const progressRef = useRef<HTMLDivElement>(null)
 const rafRef = useRef<number>(0)
 const startTsRef = useRef<number>(Date.now())
 const remainingRef = useRef<number | null>(null)
 const pauseBeginRef = useRef<number | null>(null)
 const onRemoveRef = useRef(onRemove)
 const durationRef = useRef(toast.duration)
 onRemoveRef.current = onRemove
 durationRef.current = toast.duration
 const isPersistent = toast.duration === 0 || toast.duration == null
 const effectiveDuration = durationRef.current ?? DEFAULT_DURATION
 const config = TOAST_CONFIG[toast.type]
 const Icon = config.icon

 // Entrance stagger: later groups and deeper stack positions start later.
 const entranceDelay = groupIndex * SPRING_STAGGER_MS + stackIndex * 40

 // ── Exit collapse phase ─────────────────────────────────────────────────────
 const [isCollapsing, setIsCollapsing] = useState(false)
 const measuredHeight = useRef<number>(0)

 // Measure height synchronously during the render in which exit starts, so
 // maxHeight is already correct on the very first collapse frame.
 if (isExiting && !measuredHeight.current && cardRef.current) {
  measuredHeight.current = cardRef.current.offsetHeight
 }

 // Trigger collapse once the spring-out animation has played.
 useEffect(() => {
  if (!isExiting) return
  const collapseTimer = setTimeout(() => setIsCollapsing(true), EXIT_SPRING_MS)
  return () => clearTimeout(collapseTimer)
 }, [isExiting])

 // ── Countdown via rAF ───────────────────────────────────────────────────────
 useEffect(() => {
  if (isPersistent || isExiting) return

  const delayTimer = setTimeout(() => {
   startTsRef.current = Date.now()
   remainingRef.current = effectiveDuration
   pauseBeginRef.current = null

   const tick = () => {
    if (!paused) {
     const elapsed = Date.now() - startTsRef.current
     const remaining = Math.max(0, (remainingRef.current ?? effectiveDuration) - elapsed)
     if (progressRef.current && !isExiting) {
      progressRef.current.style.transform = `scaleX(${remaining / effectiveDuration})`
     }
     if (remaining <= 0) {
      onStartExit(toast.id)
      setTimeout(() => onRemoveRef.current(toast.id), EXIT_TOTAL_MS)
      return
     }
    }
    rafRef.current = requestAnimationFrame(tick)
   }

   rafRef.current = requestAnimationFrame(tick)
  }, entranceDelay)

  return () => {
   clearTimeout(delayTimer)
   if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }
  // entranceDelay/effectiveDuration are read through refs or derived from the
  // same toast identity, so they are intentionally not deps: re-arming the rAF
  // loop on every render would restart the countdown.
 }, [toast.id, isPersistent, isExiting, paused])

 // ── Track remaining time across pause/resume ────────────────────────────────
 useEffect(() => {
  if (isPersistent || isExiting) return
  if (paused) {
   pauseBeginRef.current = Date.now()
  } else {
   const pauseDuration = pauseBeginRef.current ? Date.now() - pauseBeginRef.current : 0
   startTsRef.current += pauseDuration
   pauseBeginRef.current = null
  }
 }, [paused, isPersistent, isExiting])

 // ── Seed the progress bar's origin/value ────────────────────────────────────
 useEffect(() => {
  if (!progressRef.current || isPersistent || isExiting) return
  progressRef.current.style.transformOrigin = 'left'
  progressRef.current.setAttribute('aria-valuenow', '100')
 }, [isPersistent, isExiting, effectiveDuration])

 const dismiss = () => {
  onStartExit(toast.id)
  setTimeout(() => onRemove(toast.id), EXIT_TOTAL_MS)
 }

 const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Escape') {
   e.stopPropagation()
   dismiss()
  }
 }

 // ── Swipe-to-dismiss (touch) ────────────────────────────────────────────────
 const touchStartX = useRef<number>(0)
 const currentTranslate = useRef<number>(0)
 const [swipeOffset, setSwipeOffset] = useState(0)

 const handleTouchStart = (e: React.TouchEvent) => {
  touchStartX.current = e.touches[0].clientX
 }
 const handleTouchMove = (e: React.TouchEvent) => {
  const dx = e.touches[0].clientX - touchStartX.current
  currentTranslate.current = dx
  setSwipeOffset(Math.max(-200, Math.min(0, dx)))
 }
 const handleTouchEnd = () => {
  if (currentTranslate.current < -SWIPE_THRESHOLD_PX) {
   dismiss()
  }
  setSwipeOffset(0)
  currentTranslate.current = 0
 }

 return (
  <div
   role="alert"
   aria-live="assertive"
   aria-atomic="true"
   aria-label={t('common.toast.itemAria', { label: t(TOAST_LABEL_KEYS[toast.type]), message: toast.message })}
   data-toast-id={toast.id}
   data-toast-type={toast.type}
   data-exiting={isExiting ? 'true' : undefined}
   ref={cardRef}
   style={
    {
     '--stack-depth': stackIndex,
     '--entrance-delay': `${entranceDelay}ms`,
     // Clear the delay on exit so spring-out starts immediately.
     animationDelay: isExiting ? '0ms' : 'var(--entrance-delay)',
     ...(isExiting
      ? {
       maxHeight: isCollapsing ? 0 : `${measuredHeight.current}px`,
       overflow: 'hidden' as const,
       transition: isCollapsing
        ? 'max-height 0.25s ease-out, opacity 0.2s ease-out'
        : undefined,
      }
      : {}),
    } as CSSProperties
   }
   className={cn(
    'relative flex items-stretch overflow-hidden rounded-xl border',
    'backdrop-blur-2xl backdrop-saturate-150',
    config.bg,
    config.border,
    config.shadow,
    !isExiting && 'animate-toast-spring-in',
    isExiting && 'animate-toast-spring-out',
    stackIndex > 0 && 'opacity-90',
    swipeOffset !== 0 && `translate-x-[${swipeOffset}px]`,
    'transition-transform duration-200',
   )}
   onMouseEnter={() => setPaused(true)}
   onMouseLeave={() => setPaused(false)}
   onTouchStart={handleTouchStart}
   onTouchMove={handleTouchMove}
   onTouchEnd={handleTouchEnd}
  >
   {/* Left accent bar */}
   <div className={cn('w-1 shrink-0 rounded-l-xl', config.accent)} aria-hidden="true" />

   {/* Icon (swaps to a pause glyph while the countdown is held) */}
   <div className="flex items-center pl-3 py-3 pr-2 shrink-0">
    <span
     className={cn('flex items-center justify-center w-7 h-7 rounded-lg', config.iconWrap)}
     aria-hidden="true"
    >
     {paused && !isPersistent ? (
      <Pause className="w-4 h-4" strokeWidth={2.2} />
     ) : (
      <Icon className="w-[17px] h-[17px]" strokeWidth={2} />
     )}
    </span>
   </div>

   {/* Content */}
   <div className="flex-1 flex flex-col justify-center gap-1 pl-1 pr-2 py-3 min-w-0">
    {toast.title && (
     <span className={cn('text-xs font-semibold leading-none', config.text, 'opacity-70')}>
      {toast.title}
     </span>
    )}
    <div className="flex items-start gap-1.5">
     <p className={cn('text-sm font-medium leading-snug flex-1', config.text, 'line-clamp-2')}>
      {toast.message}
     </p>
     {toast.actionLabel && toast.onAction && (
      <button
       type="button"
       onClick={(e) => {
        e.stopPropagation()
        toast.onAction?.()
       }}
       className={cn(
        'self-start shrink-0 text-xs font-bold uppercase tracking-wide',
        'underline underline-offset-[3px] decoration-current/30',
        'hover:decoration-current transition-all leading-snug mt-0.5',
        config.text,
       )}
      >
       {toast.actionLabel}
      </button>
     )}
    </div>
   </div>

   {/* Close button */}
   <button
    type="button"
    onClick={dismiss}
    onFocus={() => setPaused(true)}
    onBlur={() => setPaused(false)}
    onKeyDown={handleKeyDown}
    aria-label={t('common.toast.closeAria', { message: toast.message })}
    className={cn(
     'h-full w-8 flex items-center justify-center self-stretch shrink-0',
     'hover:bg-black/[0.07] active:bg-black/[0.12]',
     'transition-colors duration-150',
     'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
     config.focusRing,
    )}
   >
    <X
     className="w-3.5 h-3.5 opacity-35 group-hover:opacity-100 transition-opacity"
     aria-hidden="true"
    />
   </button>

   {/* Progress bar (absent for persistent toasts) */}
   {!isPersistent && (
    <div
     className="absolute bottom-0 left-0 right-0 h-[3px]"
     role="progressbar"
     aria-valuenow={100}
     aria-valuemin={0}
     aria-valuemax={100}
     aria-label={t('common.toast.remainingAria')}
    >
     <div
      ref={progressRef}
      className={cn('h-full origin-left rounded-r-sm', config.progressBg)}
      style={paused ? { transform: 'scaleX(1)' } : undefined}
     />
     {paused && !isExiting && (
      <div
       aria-hidden="true"
       className="absolute inset-0 bg-black/[0.04] backdrop-blur-[1px]"
      />
     )}
    </div>
   )}
  </div>
 )
}

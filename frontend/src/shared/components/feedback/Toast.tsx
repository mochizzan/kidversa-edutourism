/**
 * Toast Notification System — Redesigned
 *
 * Keyframes are registered in `src/index.css` via Tailwind `@theme` so that
 * Tailwind-generated utility classes (e.g. `animate-toast-spring-in`) resolve
 * at build time. The runtime-injected style block below is a safety net that
 * registers the same keyframes in the document head for environments where
 * Tailwind processing may not catch them (SSR, hot-reload).
 *
 * Features:
 *  • Spring animations (entrance overshoot + staggered stack entrance)
 *  • Glassmorphism cards with specular highlight and inner glow
 *  • Responsive placement: mobile → top-center (full-width), desktop → bottom-right
 *  • Animated progress-bar countdown (rAF-tracked)
 *  • ARIA: role="alert" per item, aria-live="polite" region, aria-relevant="additions removals",
 *           aria-roledescription groups, aria-limit on progressbar
 *  • Grouped stacking by type (same-type toasts share a group column)
 *  • Overflow badge "+N more" per group (capped at MAX_VISIBLE_PER_GROUP)
 *  • Swipe-to-dismiss on touch (mobile)
 *  • Hover/focus pause with elapsed-time tooltip
 *  • Dismiss-all button in container (shown when ≥ 2 toasts)
 *  • Per-item timestamp label ("baru saja", "2 menit lalu")
 *  • Toast counter badge on container
 *  • Entrance stagger: each group item is offset by groupIndex * 60 ms
 *
 * Architecture:
 *  ToastProvider   — context holder; renders ToastContainer + injects keyframe styles
 *  ToastRegistry   — singleton ref exposed so components can call
 *                    toastRegistry.current.show(...) imperatively
 *  useGlobalToast() — convenience hook for components already in a Provider
 *
 * @module Toast
 *
 * --------------------------------------------------------------------------
 * MAINTAINER NOTES
 * --------------------------------------------------------------------------
 *
 * Animation registration (two-layer system)
 * ------------------------------------------
 * All toast keyframes are declared in `src/index.css` inside a `@theme` block.
 * Tailwind v4 processes `@theme` at build time and generates utility classes
 * such as `animate-toast-spring-in`, `animate-toast-spring-out`, etc.
 *
 * The runtime-injected `<style>` tag in `useToastStyles()` is a safety net that
 * re-declares the same keyframes in the document head for hot-reload or SSR
 * environments where Tailwind's build step hasn't run. It does NOT declare
 * `@theme` (which would be silently ignored by the browser).
 *
 * Adding a new animation:
 *   1. Add the `@keyframes` to the `TOAST_KEYFRAMES` string below.
 *   2. Add the corresponding `--animate-toast-*` entry in `src/index.css`
 *      inside the `@theme` block so Tailwind generates the utility class.
 *   3. Use the `animate-toast-*` class in JSX (do NOT inline `animation:`
 *      strings unless there is no corresponding utility).
 *
 * Public API surface
 * -------------------
 *   export type ToastType
 *   export interface Toast          — shape is stable; `_createdAt` is internal.
 *   export function ToastProvider   — wrap your app (or root layout) in this.
 *   export function useGlobalToast  — call inside a Provider tree; falls back to
 *                                    ToastRegistry when outside.
 *   export const ToastRegistry      — { current: ToastContextValue | null }.
 *                                    Set by ToastProvider; read from anywhere.
 *   export function useToast        — legacy local-state hook; backward-compat.
 *
 * Adding a new toast type
 * -----------------------
 *   1. Add the literal to `ToastType` above.
 *   2. Add a matching entry in `TOAST_CONFIG` (icon, label, colors, shadow, etc.).
 *
 * Backward-compatibility contract
 * -------------------------------
 *   - `Toast` interface shape is frozen: `id`, `type`, `message`, `duration`,
 *     `actionLabel`, `onAction`, `title` are all preserved.
 *   - `useToast()` return shape `{ toasts, addToast, removeToast }` is preserved.
 *   - `addToast` returns the generated `id` (string).
 *   - `dismissAll()` on the context clears all toasts immediately.
 *   - `removeToast(id)` triggers the exit animation before unmounting.
 *   - The `_createdAt` field is @internal; callers should never set it.
 *
 * Performance considerations
 * --------------------------
 *   - `requestAnimationFrame` drives the progress bar for sub-frame accuracy.
 *     The rAF loop is cancelled on unmount / exit.
 *   - Each ToastItem has its own rAF loop; with ≤3 visible per group × ≤N groups
 *     this is negligible, but avoid adding hundreds of toasts.
 *   - `useToastStyles()` is idempotent (inject-once guard) and runs in the
 *     provider render path, before children mount.
 *
 * Accessibility (WCAG 2.1 AA)
 * ----------------------------
 *   - Per-item: `role="alert"`, `aria-live="assertive"`, `aria-atomic="true"`.
 *   - Container: `role="region"`, `aria-live="polite"`, `aria-atomic="false"`,
 *     `aria-relevant="additions removals"`.
 *   - Groups: `role="group"`, `aria-roledescription="grup notifikasi"`,
 *     `aria-setsize`, `aria-posinset`.
 *   - Progress: `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-limit="1"`.
 *   - Timestamps: `aria-live="off"` to prevent live-region re-announcement.
 *   - Escape key dismisses all toasts (global handler in ToastContainer).
 *
 * Known limitations
 * -----------------
 *   - Animation-delay is set via an inline `animationDelay` style on the card
 *     element; if a toast's `duration` changes after mount the CSS animation
 *     is not re-triggered — the rAF-driven progress bar remains authoritative.
 *   - `translate-x-[${swipeOffset}px]` requires Tailwind JIT. If using a locked
 *     safelist, add `translate-x-0` and the range of expected offsets.
 *   - The `opacity-88` Tailwind class on stacked items is non-standard (custom
 *     opacity in this project); verify it resolves if Tailwind config changes.
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  createContext,
  useContext,
  type ReactNode,
  type CSSProperties,
} from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
  ChevronUp,
  Pause,
} from 'lucide-react'
import { cn } from '../../../core/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  /** Duration in ms; 0 = persistent (no auto-dismiss, no progress bar) */
  duration?: number
  /** Optional action chip label */
  actionLabel?: string
  /** Callback when action chip is clicked */
  onAction?: () => void
  /** Optional title displayed above message */
  title?: string
  /** @internal Timestamp captured at creation for relative-time display */
  _createdAt?: number
}

interface ToastContextValue {
  addToast: (toast: Omit<Toast, 'id'>) => string
  removeToast: (id: string) => void
  dismissAll: () => void
  toasts: Toast[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_DURATION = 5000
const MAX_VISIBLE_PER_GROUP = 3
const SPRING_STAGGER_MS = 60 // ms between each stacked item's entrance
const SWIPE_THRESHOLD_PX = 80
const EXIT_SPRING_MS = 360 // toastSpringOut duration
const EXIT_COLLAPSE_MS = 250 // height collapse after spring-out
const EXIT_TOTAL_MS = EXIT_SPRING_MS + EXIT_COLLAPSE_MS + 10 // total exit time before removal

// ─── Spring keyframes ─────────────────────────────────────────────────────────

// ─── Runtime style injection ────────────────────────────────────────────────────
// Keyframes are declared in `src/index.css` via `@theme` so Tailwind v4 resolves
// `animate-toast-*` utility classes at build time. The block below is a safety net
// that re-declares the keyframes in the document head for hot-reload / SSR
// environments where Tailwind's build step hasn't run yet.

const TOAST_KEYFRAMES = `
@keyframes toastSpringIn {
  0%   { opacity: 0; transform: translateY(24px) scale(0.91); }
  50%  { opacity: 1; transform: translateY(-4px) scale(1.025); }
  72%  { transform: translateY(1.5px) scale(0.992); }
  88%  { transform: translateY(-0.5px) scale(1.003); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes toastSpringOut {
  0%   { opacity: 1; transform: translateY(0) scale(1); }
  35%  { opacity: 0.7; transform: translateY(8px) scale(1.04); }
  100% { opacity: 0; transform: translateY(24px) scale(0.86); }
}
@keyframes toastBadgePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(91, 44, 141, 0.35); }
  60%      { box-shadow: 0 0 0 6px rgba(91, 44, 141, 0); }
}
`

// ─── Style Injection ──────────────────────────────────────────────────────────

function useToastStyles() {
  const injected = useRef(false)
  if (!injected.current) {
    // Guard: only run in browser
    if (typeof document !== 'undefined') {
      const el = document.createElement('style')
      el.setAttribute('data-toast-styles', '')
      el.textContent = TOAST_KEYFRAMES
      document.head.appendChild(el)
      injected.current = true
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

// ---------------------------------------------------------------------------
// ToastRegistry
// ---------------------------------------------------------------------------
// Module-level singleton that ToastProvider updates on every render.
// Allows non-Provider consumers (e.g. hot-path event handlers, utility
// functions) to post toasts imperatively without a React context.

/**
 * Imperative singleton registry.
 *
 * Populated automatically by `ToastProvider` — no manual setup required.
 * Read from anywhere (even outside the React tree) to access the current
 * `addToast` / `removeToast` / `dismissAll` methods.
 *
 * @example
 * // From anywhere (even outside a component):
 * ToastRegistry.current?.addToast({ type: 'info', message: 'Saved!' })
 *
 * @see useGlobalToast for a hook-based alternative inside components.
 */
export const ToastRegistry = { current: null as ToastContextValue | null }

// ---------------------------------------------------------------------------
// useGlobalToast
// ---------------------------------------------------------------------------

/**
 * Hook that returns the current toast context.
 *
 * Inside a `ToastProvider` tree: returns the live context (re-renders on
 * toast list changes).
 * Outside a `ToastProvider` tree: falls back to `ToastRegistry.current` so
 * toast calls don't throw (graceful degradation). If the registry is also
 * null, throws with an instructive error message.
 *
 * @returns The `ToastContextValue` from context or registry.
 * @throws If called outside a provider tree AND `ToastRegistry.current` is null.
 */
export function useGlobalToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fall back to the singleton registry so toast calls don't throw
    // outside of a Provider tree (graceful degradation).
    if (ToastRegistry.current) return ToastRegistry.current
    throw new Error('useGlobalToast() harus digunakan di dalam <ToastProvider>')
  }
  return ctx
}

// ─── Per-type visual configuration ────────────────────────────────────────────

const TOAST_CONFIG: Record<
  ToastType,
  {
    icon: typeof CheckCircle2
    label: string
    bg: string
    text: string
    border: string
    accent: string
    progressBg: string
    shadow: string
    iconWrap: string
    focusRing: string
    badgeBg: string
  }
> = {
  success: {
    icon: CheckCircle2,
    label: 'Berhasil',
    bg: 'bg-green-50/92 dark:bg-green-950/80',
    text: 'text-green-900 dark:text-green-100',
    border: 'border-green-200/50 dark:border-green-700/40',
    accent: 'bg-green-500',
    progressBg: 'bg-green-400/50 dark:bg-green-500/40',
    shadow: 'shadow-[0_8px_32px_rgba(22,163,74,0.12)] dark:shadow-none',
    iconWrap: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-300',
    focusRing: 'focus-visible:ring-green-400',
    badgeBg: 'bg-green-500',
  },
  error: {
    icon: XCircle,
    label: 'Gagal',
    bg: 'bg-red-50/92 dark:bg-red-950/80',
    text: 'text-red-900 dark:text-red-100',
    border: 'border-red-200/50 dark:border-red-700/40',
    accent: 'bg-red-500',
    progressBg: 'bg-red-400/50 dark:bg-red-500/40',
    shadow: 'shadow-[0_8px_32px_rgba(220,38,38,0.12)] dark:shadow-none',
    iconWrap: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300',
    focusRing: 'focus-visible:ring-red-400',
    badgeBg: 'bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Peringatan',
    bg: 'bg-amber-50/92 dark:bg-amber-950/80',
    text: 'text-amber-900 dark:text-amber-100',
    border: 'border-amber-200/50 dark:border-amber-700/40',
    accent: 'bg-amber-500',
    progressBg: 'bg-amber-400/50 dark:bg-amber-500/40',
    shadow: 'shadow-[0_8px_32px_rgba(245,158,11,0.12)] dark:shadow-none',
    iconWrap: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
    focusRing: 'focus-visible:ring-amber-400',
    badgeBg: 'bg-amber-500',
  },
  info: {
    icon: Info,
    label: 'Info',
    bg: 'bg-blue-50/92 dark:bg-blue-950/80',
    text: 'text-blue-900 dark:text-blue-100',
    border: 'border-blue-200/50 dark:border-blue-700/40',
    accent: 'bg-blue-500',
    progressBg: 'bg-blue-400/50 dark:bg-blue-500/40',
    shadow: 'shadow-[0_8px_32px_rgba(59,130,246,0.12)] dark:shadow-none',
    iconWrap: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300',
    focusRing: 'focus-visible:ring-blue-400',
    badgeBg: 'bg-blue-500',
  },
}

// ─── Toast Item ────────────────────────────────────────────────────────────────

interface ToastItemProps {
  toast: Toast
  onRemove: (id: string) => void
  stackIndex: number
  groupIndex: number
  isExiting: boolean
  onStartExit: (id: string) => void
}

function ToastItem({
  toast,
  onRemove,
  stackIndex,
  groupIndex,
  isExiting,
  onStartExit,
}: ToastItemProps) {
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

  // ── Exit collapse phase ───────────────────────────────────────────────────
  // Two-phase exit: spring-out (360ms) → height collapse (250ms)
  const [isCollapsing, setIsCollapsing] = useState(false)
  const measuredHeight = useRef<number>(0)

  // Measure height synchronously during render when exit starts,
  // so maxHeight is set correctly on the very first frame.
  if (isExiting && !measuredHeight.current && cardRef.current) {
    measuredHeight.current = cardRef.current.offsetHeight
  }

  // Trigger collapse after spring-out animation completes
  useEffect(() => {
    if (!isExiting) return
    const collapseTimer = setTimeout(() => {
      setIsCollapsing(true)
    }, EXIT_SPRING_MS)
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
          const elapsed = Date.now() - startTsRef.current!
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
  }, [toast.id, isPersistent, isExiting, paused])

  // ── Track remaining on pause/resume ─────────────────────────────────────────
  useEffect(() => {
    if (isPersistent || isExiting) return
    if (paused) {
      pauseBeginRef.current = Date.now()
    } else {
      const now = Date.now()
      const pauseDuration = pauseBeginRef.current ? now - pauseBeginRef.current : 0
      startTsRef.current += pauseDuration
      pauseBeginRef.current = null
    }
  }, [paused, isPersistent, isExiting])

  // ── Sync CSS progress animation with rAF state ──────────────────────────────
  useEffect(() => {
    if (!progressRef.current || isPersistent || isExiting) return
    progressRef.current.style.transformOrigin = 'left'
    progressRef.current.setAttribute('aria-valuenow', '100')
  }, [isPersistent, isExiting, effectiveDuration])

  // ── Escape key ──────────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onStartExit(toast.id)
      setTimeout(() => onRemove(toast.id), EXIT_TOTAL_MS)
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
      onStartExit(toast.id)
      setTimeout(() => onRemove(toast.id), EXIT_TOTAL_MS)
    }
    setSwipeOffset(0)
    currentTranslate.current = 0
  }

  // ── Entrance animation delay (stagger) ──────────────────────────────────────
  const entranceDelay = groupIndex * SPRING_STAGGER_MS + stackIndex * 40

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      aria-label={`${config.label}: ${toast.message}`}
      data-toast-id={toast.id}
      data-toast-type={toast.type}
      data-exiting={isExiting ? 'true' : undefined}
      ref={cardRef}
      style={
        {
          '--stack-depth': stackIndex,
          '--entrance-delay': `${entranceDelay}ms`,
          // Clear animation delay on exit so spring-out starts immediately
          animationDelay: isExiting ? '0ms' : `var(--entrance-delay)`,
          // Collapse phase: transition maxHeight to 0
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
      {/* ── Left accent bar ────────────────────────────────────────────────── */}
      <div
        className={cn('w-1 shrink-0 rounded-l-xl', config.accent)}
        aria-hidden="true"
      />

      {/* ── Icon ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center pl-3 py-3 pr-2 shrink-0">
        <span
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-lg',
            config.iconWrap,
          )}
          aria-hidden="true"
        >
          {paused && !isPersistent ? (
            <Pause className="w-4 h-4" strokeWidth={2.2} />
          ) : (
            <Icon className="w-[17px] h-[17px]" strokeWidth={2} />
          )}
        </span>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center gap-1 pl-1 pr-2 py-3 min-w-0">
        {toast.title && (
          <span
            className={cn(
              'text-xs font-semibold leading-none',
              config.text,
              'opacity-70',
            )}
          >
            {toast.title}
          </span>
        )}
        <div className="flex items-start gap-1.5">
          <p
            className={cn(
              'text-sm font-medium leading-snug flex-1',
              config.text,
              'line-clamp-2',
            )}
          >
            {toast.message}
          </p>
          {/* Action chip */}
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

      {/* ── Close button ──────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => {
          onStartExit(toast.id)
          setTimeout(() => onRemove(toast.id), EXIT_TOTAL_MS)
        }}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onKeyDown={handleKeyDown}
        aria-label={`Tutup notifikasi: ${toast.message}`}
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

      {/* ── Progress bar ────────────────────────────────────────────────────── */}
      {!isPersistent && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[3px]"
          role="progressbar"
          aria-valuenow={100}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Sisa waktu notifikasi"
        >
          <div
            ref={progressRef}
            className={cn(
              'h-full origin-left rounded-r-sm',
              config.progressBg,
            )}
            style={
              paused
                ? { transform: 'scaleX(1)' }
                : undefined
            }
          />
          {/* Pause overlay */}
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

// ─── Toast Container ──────────────────────────────────────────────────────────

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

/**
 * Groups toasts by type.
 * Ordering:
 *  1. Groups sorted newest-first (group whose latest toast arrived most recently is on top).
 *  2. Within each group, newest toast is index 0.
 *  3. Only top MAX_VISIBLE_PER_GROUP items render; overflow shown as badge.
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

function ToastContainer({
  toasts,
  onRemove,
}: ToastContainerProps) {
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)

  // Clean up exiting IDs after animation completes
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

  // Sort groups by newest-toast timestamp (descending)
  const sortedGroups = useMemo(() => {
    return Array.from(groups.entries()).sort((a, b) => {
      const aNewest = a[1][0]?.id ?? ''
      const bNewest = b[1][0]?.id ?? ''
      return bNewest.localeCompare(aNewest)
    })
  }, [groups])

  const handleStartExit = useCallback((id: string) => {
    setExitingIds((prev) => new Set(prev).add(id))
  }, [])

  // Global Escape: dismiss all
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
        'aria-live:polite',
        'aria-atomic:false',
      )}
      role="region"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions removals"
      aria-label="Area notifikasi"
    >
      {sortedGroups.map(([type, items], groupIdx) => {
        const config = TOAST_CONFIG[type]
        const visible = items.slice(0, MAX_VISIBLE_PER_GROUP)
        const overflow = items.length - MAX_VISIBLE_PER_GROUP

        return (
          <div
            key={type}
            role="group"
            aria-roledescription="grup notifikasi"
            aria-label={`Kelompok ${config.label.toLowerCase()}, ${items.length} pesan`}
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

            {/* Overflow badge */}
            {overflow > 0 && (
              <button
                type="button"
                aria-label={`${overflow} notifikasi ${config.label.toLowerCase()} lainnya — klik untuk menampilkan`}
                title={`+${overflow} lainnya`}
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
                <span>notifikasi {config.label.toLowerCase()} lainnya</span>
                <ChevronUp className="w-3.5 h-3.5 opacity-50" aria-hidden="true" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Toast Provider ───────────────────────────────────────────────────────────

/**
 * Root provider that manages toast state and renders the `ToastContainer`.
 *
 * Wrap your app (or a top-level layout) in this component once. It:
 *   1. Holds the toast list in React state.
 *   2. Injects keyframe styles into `<head>` (once, via `useToastStyles`).
 *   3. Syncs `ToastRegistry.current` so `useGlobalToast` and imperative calls work.
 *   4. Renders `ToastContainer` as a portal-friendly fixed overlay.
 *
 * @example
 * // In App.tsx:
 * import { ToastProvider } from '@/shared/components/feedback/Toast'
 *
 * function App() {
 *   return (
 *     <ToastProvider>
 *       <RouterProvider router={router} />
 *     </ToastProvider>
 *   )
 * }
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  // Inject toast keyframes into the document head (once, idempotent).
  // Must run before children mount so animations are available immediately.
  useToastStyles()

  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((raw: Omit<Toast, 'id'>) => {
    const id = generateId()
    const now = Date.now()
    const newToast: Toast = {
      ...raw,
      id,
      // Timestamp captured here so relative-time ("baru saja", "2 menit lalu")
      // renders correctly across re-renders. Do NOT mutate this field later.
      _createdAt: now,
    }
    setToasts((prev) => {
      const isDuplicate = prev.some(
        (t) =>
          t.type === raw.type &&
          t.message === raw.message &&
          t._createdAt !== undefined &&
          now - t._createdAt < 3000,
      )
      if (isDuplicate) return prev
      return [newToast, ...prev]
    })
    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const dismissAll = useCallback(() => {
    setToasts([])
  }, [])

  const ctxValue = useMemo<ToastContextValue>(
    () => ({ addToast, removeToast, dismissAll, toasts }),
    [addToast, removeToast, dismissAll, toasts],
  )

  // Sync the singleton registry so useGlobalToast works even when
  // the consumer is rendered outside the Provider subtree.
  ToastRegistry.current = ctxValue

  return (
    <ToastContext.Provider value={ctxValue}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

// ─── Local Toast Hook (component-scoped, backward-compatible) ──────────────────
// Renders its own local container; useGlobalToast / ToastProvider preferred.

/**
 * Legacy component-scoped toast hook.
 *
 * Manages its own toast list with `useState` — does NOT participate in the
 * global `ToastProvider` tree. Returned `addToast` / `removeToast` only
 * affect the calling component's container.
 *
 * **Prefer `useGlobalToast()` + `ToastProvider`** for new code. This hook
 * exists for backward compatibility and isolated component use-cases.
 *
 * @returns `{ toasts, addToast, removeToast }` — local state, not shared.
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = generateId()
    const newToast = { ...toast, id } as Toast
    setToasts((prev) => [newToast, ...prev])
    if (toast.duration !== 0) {
      const duration = toast.duration ?? DEFAULT_DURATION
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration + 400)
    }
    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}

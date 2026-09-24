import { CheckCircle2, XCircle, AlertTriangle, Info, type LucideIcon } from 'lucide-react'
import type { ToastType } from '../../../../core/types/toast'

// ─── Timing ───────────────────────────────────────────────────────────────────

export const DEFAULT_DURATION = 5000
export const MAX_VISIBLE_PER_GROUP = 3
/** ms between each stacked item's entrance. */
export const SPRING_STAGGER_MS = 60
export const SWIPE_THRESHOLD_PX = 80
/** toastSpringOut duration. */
export const EXIT_SPRING_MS = 360
/** Height collapse after spring-out. */
export const EXIT_COLLAPSE_MS = 250
/** Total exit time before the item is removed from the store. */
export const EXIT_TOTAL_MS = EXIT_SPRING_MS + EXIT_COLLAPSE_MS + 10

// ─── Keyframes ────────────────────────────────────────────────────────────────
// Keyframes are declared in `src/index.css` via Tailwind v4 `@theme`, which is
// what generates the `animate-toast-*` utility classes at build time. The string
// below is re-injected at runtime as a safety net for hot-reload / SSR paths
// where Tailwind's build step has not run. When adding an animation, add the
// @keyframes here AND the matching `--animate-toast-*` entry in `src/index.css`.

export const TOAST_KEYFRAMES = `
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

// ─── Per-type visual configuration ────────────────────────────────────────────
// To add a toast type: add the literal to ToastType (core/types/toast.ts) and a
// matching entry here — TypeScript then flags every unhandled branch.

export interface ToastVisualConfig {
  icon: LucideIcon
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

export const TOAST_CONFIG: Record<ToastType, ToastVisualConfig> = {
  success: {
    icon: CheckCircle2,
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
    bg: 'bg-amber-50/92 dark:bg-amber-950/80',
    text: 'text-amber-900 dark:text-amber-100',
    border: 'border-amber-200/50 dark:border-amber-700/40',
    accent: 'bg-amber-500',
    progressBg: 'bg-amber-400/50 dark:bg-amber-500/40',
    shadow: 'shadow-[0_8px_32px_rgba(245,158,11,0.12)] dark:shadow-none',
    iconWrap: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300',
    focusRing: 'focus-visible:ring-amber-400',
    badgeBg: 'bg-amber-500',
  },
  info: {
    icon: Info,
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

/** Catalog keys for the human-readable toast type label (rendered via t). */
export const TOAST_LABEL_KEYS = {
  success: 'common.toast.success',
  error: 'common.toast.error',
  warning: 'common.toast.warning',
  info: 'common.toast.info',
} as const

/**
 * Toast notification system — public entry point.
 *
 * The implementation is split under `./toast/`:
 *   toastConfig      — timings, keyframes, per-type visual config
 *   toastContext     — useGlobalToast (store read/dispatch) + useToastStyles
 *   ToastItem        — one card: rAF countdown, pause, swipe, two-phase exit
 *   ToastContainer   — fixed overlay, type grouping, overflow badge, Escape-all
 *   ToastProvider    — render shell wired to core/stores/toastStore
 *
 * State lives in `core/stores/toastStore` (Zustand); the `Toast`/`ToastType`
 * contract lives in `core/types/toast`. This module only re-exports the public
 * surface — `ToastType`, `Toast`, `ToastProvider`, `useGlobalToast` — so the
 * import path used across the app stays stable.
 *
 * To add a toast type: add the literal to `ToastType` in `core/types/toast` and
 * a matching entry in `TOAST_CONFIG`; TypeScript then flags every gap.
 */
export type { Toast, ToastType } from '../../../core/types/toast'
export { useGlobalToast } from './toast/toastContext'
export { ToastProvider } from './toast/ToastProvider'

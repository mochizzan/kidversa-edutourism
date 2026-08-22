import { useRef } from 'react'
import { useToastStore } from '../../../../core/stores/toastStore'
import { TOAST_KEYFRAMES } from './toastConfig'

/**
 * Read/dispatch surface for toasts. State lives in `core/stores/toastStore`
 * (Zustand); this hook subscribes so consumers re-render on toast-list changes.
 *
 * Public API — call inside a `<ToastProvider>` tree.
 */
export function useGlobalToast() {
  const addToast = useToastStore((s) => s.addToast)
  const removeToast = useToastStore((s) => s.removeToast)
  const dismissAll = useToastStore((s) => s.dismissAll)
  const toasts = useToastStore((s) => s.toasts)
  return { addToast, removeToast, dismissAll, toasts }
}

/**
 * Injects the toast keyframes into `<head>` exactly once. Idempotent per mount
 * and a no-op outside the browser; runs in the provider render path so the
 * animations resolve before any child mounts.
 */
export function useToastStyles() {
  const injected = useRef(false)
  if (!injected.current && typeof document !== 'undefined') {
    const el = document.createElement('style')
    el.setAttribute('data-toast-styles', '')
    el.textContent = TOAST_KEYFRAMES
    document.head.appendChild(el)
    injected.current = true
  }
}

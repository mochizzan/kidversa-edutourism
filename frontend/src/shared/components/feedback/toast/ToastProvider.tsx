import type { ReactNode } from 'react'
import { useToastStore } from '../../../../core/stores/toastStore'
import { useToastStyles } from './toastContext'
import { ToastContainer } from './ToastContainer'

/**
 * Root provider. Wrap the app (or a top-level layout) in this once.
 *
 * It is a thin render shell — all state lives in `core/stores/toastStore`:
 *   1. injects the keyframe styles into `<head>` (once, before children mount),
 *   2. subscribes to the store's toast list,
 *   3. paints `<ToastContainer>` as a fixed overlay.
 *
 * @example
 * <ToastProvider>
 *   <RouterProvider router={router} />
 * </ToastProvider>
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  useToastStyles()

  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  return (
    <>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  )
}

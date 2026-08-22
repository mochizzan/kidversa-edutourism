export type ToastType = 'success' | 'error' | 'warning' | 'info'

/**
 * Toast payload. Shape is a stable public contract: `id`, `type`, `message`,
 * `duration`, `actionLabel`, `onAction` and `title` are preserved.
 *
 * Lives in `core/types` (not the shared UI component) so `core/stores/toastStore`
 * can own the state without importing from `shared/` — the reverse edge the
 * feature -> core -> shared DAG forbids.
 */
export interface Toast {
  id: string
  type: ToastType
  message: string
  /** Duration in ms; 0 or undefined = persistent (no auto-dismiss, no progress bar). */
  duration?: number
  /** Optional action chip label. */
  actionLabel?: string
  /** Callback when the action chip is clicked. */
  onAction?: () => void
  /** Optional title displayed above the message. */
  title?: string
  /** @internal Timestamp captured at creation; used for rapid-fire de-duping. */
  _createdAt?: number
}

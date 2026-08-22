import { create } from 'zustand'
import type { Toast } from '../types/toast'

// Global toast state, centralized in core/stores (the innermost application
// layer) so any feature can post toasts without importing the shared UI
// component. The shared <ToastProvider> renders from this store; useGlobalToast
// reads from it. ToastRegistry / legacy useToast were removed — this store is
// the single source of truth.

function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => string
  removeToast: (id: string) => void
  dismissAll: () => void
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  addToast: (raw) => {
    const id = generateId()
    const now = Date.now()
    const newToast: Toast = { ...raw, id, _createdAt: now }
    // De-dupe identical rapid-fire toasts (same type+message within 3s).
    if (
      get().toasts.some(
        (t) =>
          t.type === raw.type &&
          t.message === raw.message &&
          t._createdAt !== undefined &&
          now - t._createdAt < 3000,
      )
    ) {
      return id
    }
    set((prev) => ({ toasts: [newToast, ...prev.toasts] }))
    return id
  },
  removeToast: (id) => set((prev) => ({ toasts: prev.toasts.filter((t) => t.id !== id) })),
  dismissAll: () => set({ toasts: [] }),
}))

// Imperative escape hatch for non-component code (event handlers, utilities).
// Kept minimal: delegates to the store so there is exactly one state source.
export const toastRegistry = {
  get current() {
    const { addToast, removeToast, dismissAll, toasts } = useToastStore.getState()
    return { addToast, removeToast, dismissAll, toasts }
  },
}

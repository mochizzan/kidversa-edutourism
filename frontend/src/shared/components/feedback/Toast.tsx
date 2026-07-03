import { useState, useCallback } from 'react'
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '../../../core/utils'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    const newToast = { ...toast, id }
    setToasts((prev) => [...prev, newToast])
    if (toast.duration !== 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, toast.duration ?? 4000)
    }
    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}

const toastConfig: Record<ToastType, { icon: typeof Info; className: string }> = {
  success: {
    icon: CheckCircle2,
    className: 'text-green-600 bg-green-50 border-green-200',
  },
  error: {
    icon: XCircle,
    className: 'text-red-600 bg-red-50 border-red-200',
  },
  warning: {
    icon: AlertCircle,
    className: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  },
  info: {
    icon: Info,
    className: 'text-blue-600 bg-blue-50 border-blue-200',
  },
}

export function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const config = toastConfig[toast.type]
        const Icon = config.icon
        return (
          <div
            key={toast.id}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[320px]',
              'animate-in slide-in-from-right',
              config.className
            )}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <p className="flex-1 text-sm font-medium text-gray-900">{toast.message}</p>
            <button
              onClick={() => onRemove(toast.id)}
              className="p-1 rounded hover:bg-black/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

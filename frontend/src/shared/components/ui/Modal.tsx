import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../../core/utils'
import { Tooltip } from './Tooltip'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
  footer?: React.ReactNode
  closeOnOverlay?: boolean
}

export function Modal({ open, onClose, title, size = 'md', children, footer, closeOnOverlay = true }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={closeOnOverlay ? onClose : undefined} />
      <div
        ref={dialogRef}
        className={cn('relative w-full mx-4 bg-surface rounded-2xl shadow-lg', sizes[size])}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <h3 id="modal-title" className="text-lg font-semibold text-on-surface">{title}</h3>
          <Tooltip content="Tutup">
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>
        <div className="p-6">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-low rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

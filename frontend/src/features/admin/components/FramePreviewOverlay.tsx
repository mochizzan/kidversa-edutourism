import { useEffect } from 'react'
import { X } from 'lucide-react'

interface FramePreviewOverlayProps {
  src: string
  alt: string
  onClose: () => void
}

export function FramePreviewOverlay({ src, alt, onClose }: FramePreviewOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau frame"
    >
      <img src={src} alt={alt} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
      <button
        type="button"
        aria-label="Tutup pratinjau"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}

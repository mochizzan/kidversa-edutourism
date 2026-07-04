import { useRef, useState, useCallback, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom'
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null)

  const show = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setCoords({
      x: rect.left + rect.width / 2,
      y: position === 'top' ? rect.top : rect.bottom,
    })
  }, [position])

  const hide = useCallback(() => {
    setCoords(null)
  }, [])

  const tooltipStyle: React.CSSProperties = coords
    ? {
        position: 'fixed',
        left: coords.x,
        transform: 'translateX(-50%) translateY(-100%)',
        top: coords.y - 8,
        bottom: 'auto',
      }
    : { position: 'fixed', opacity: 0, pointerEvents: 'none', top: 0, left: 0 }

  return (
    <>
      <div
        ref={triggerRef}
        className="relative inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
      </div>
      {createPortal(
        <div
          style={tooltipStyle}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg bg-inverse-surface text-inverse-on-surface shadow-md z-[9999] pointer-events-none whitespace-nowrap transition-opacity duration-200 ${
            coords ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  )
}

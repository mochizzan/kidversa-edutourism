import { useRef, useState, useCallback, ReactNode, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom'
}

export function Tooltip({ content, children }: TooltipProps) {
  if (!content) return <>{children}</>
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [style, setStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    pointerEvents: 'none',
    opacity: 0,
  })

  const show = useCallback(() => setIsVisible(true), [])
  const hide = useCallback(() => setIsVisible(false), [])

  useLayoutEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return

    const trigger = triggerRef.current.getBoundingClientRect()
    const tooltip = tooltipRef.current.getBoundingClientRect()

    const gap = 6
    const margin = 8

    const cx = trigger.left + trigger.width / 2
    const tw = tooltip.width
    const th = tooltip.height
    const vw = window.innerWidth
    const vh = window.innerHeight

    // --- Vertical ---
    const spaceAbove = trigger.top - margin
    const spaceBelow = vh - trigger.bottom - margin
    let top: number

    if (spaceAbove >= th + gap || spaceAbove >= spaceBelow) {
      top = trigger.top - gap - th // above
    } else {
      top = trigger.bottom + gap // below
    }
    if (top < margin) top = margin
    if (top + th > vh - margin) top = vh - th - margin

    // --- Horizontal ---
    let left = cx
    let translateX: string

    // Start centered
    translateX = '-50%'

    // If centered tooltip overflows right edge: shift left
    if (cx + tw / 2 > vw - margin) {
      left = vw - margin - tw / 2
    }
    // If centered tooltip overflows left edge: shift right
    if (cx - tw / 2 < margin) {
      left = margin + tw / 2
    }

    // After centering adjustments, check if flat positioning is needed
    // (when tooltip would still clip after centering shift)
    if (left - tw / 2 < margin) {
      // Use flat-left positioning
      left = margin
      translateX = '0'
    }
    if (left + tw / 2 > vw - margin) {
      // Use flat-right positioning
      left = vw - margin - tw
      translateX = '0'
    }

    // Final safety clamp
    if (left < margin) { left = margin; translateX = '0' }
    if (left + tw > vw - margin && translateX === '0') left = vw - margin - tw

    setStyle({
      position: 'fixed',
      left,
      top,
      transform: `translateX(${translateX})`,
      pointerEvents: 'none',
      opacity: 1,
    })
  }, [isVisible])

  return (
    <>
      <div
        ref={triggerRef}
        className="relative flex"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
      </div>
      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          style={style}
          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-inverse-surface text-inverse-on-surface shadow-md z-[9999] whitespace-nowrap transition-opacity duration-100"
        >
          {content}
        </div>,
        document.body
      )}
    </>
  )
}

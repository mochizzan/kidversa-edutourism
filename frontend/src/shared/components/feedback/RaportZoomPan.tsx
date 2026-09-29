import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../../core/utils'

export interface RaportZoomPanProps {
 /** Lembar rapor berlebar tetap (px) yang menjadi isi viewport. */
 children: ReactNode
 /** Lebar konten intrinsik dalam px — pemanggil mengirim `A4_SHEET_WIDTH`. */
 sheetWidth: number
}

const ZOOM_MIN = 0.25
const ZOOM_MAX = 4
const ZOOM_STEP = 0.25
/** Sisa lembar (px) yang wajib tetap terlihat agar lembar tak bisa diseret keluar pandangan. */
const MIN_VISIBLE_PX = 48

interface Pan {
 x: number
 y: number
}

interface DragState {
 pointerId: number
 startX: number
 startY: number
 originX: number
 originY: number
}

/** Zoom langkah 25% ke arah `direction`, di-snap ke kelipatan 25% terdekat
 *  yang belum terlewati. */
function stepZoom(zoom: number, direction: 1 | -1): number {
 const step =
  direction > 0
   ? Math.floor(zoom / ZOOM_STEP + 1e-6) + 1
   : Math.ceil(zoom / ZOOM_STEP - 1e-6) - 1
 return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, step * ZOOM_STEP))
}

/** Klip longgar posisi pan terhadap ukuran viewport/konten yang terukur.
 *  Ukuran 0 (belum terukur) diartikan tanpa batas pada sumbu tersebut. */
function clampPan(
 pan: Pan,
 zoom: number,
 sheetWidth: number,
 viewportW: number,
 viewportH: number,
 contentH: number,
): Pan {
 const maxX =
  viewportW > 0
   ? Math.max(0, (viewportW + sheetWidth * zoom) / 2 - MIN_VISIBLE_PX)
   : Number.POSITIVE_INFINITY
 const minY =
  viewportH > 0 && contentH > 0
   ? // Tak pernah memaksa konten turun: saat tinggi belum stabil (iframe
   // belum load, tinggi konten kecil) clamp ini akan mendorong pan.y > 0
   // dan nilai itu bertahan setelah isi penuh terukur. Guard bawah hanya
   // menahan drag ke atas agar lembar tak hilang dari pandangan.
   Math.min(0, MIN_VISIBLE_PX - contentH * zoom)
   : Number.NEGATIVE_INFINITY
 const maxY = viewportH > 0 ? viewportH - MIN_VISIBLE_PX : Number.POSITIVE_INFINITY
 return {
  x: Math.min(Math.max(pan.x, -maxX), maxX),
  y: Math.min(Math.max(pan.y, minY), maxY),
 }
}

export function RaportZoomPan({ children, sheetWidth }: RaportZoomPanProps): React.JSX.Element {
 const { t } = useTranslation()
 const viewportRef = useRef<HTMLDivElement>(null)
 const contentRef = useRef<HTMLDivElement>(null)
 const dragRef = useRef<DragState | null>(null)

 const [pan, setPan] = useState<Pan>({ x: 0, y: 0 })
 const [dragging, setDragging] = useState(false)
 const [viewportW, setViewportW] = useState(0)
 const [zoomOverride, setZoomOverride] = useState<number | null>(null)

 // Ukur viewport sebelum paint pertama agar posisi pan bisa di-clip langsung
 // (lembar tidak pernah auto-fit — ukuran selalu 100%).
 useLayoutEffect(() => {
  const viewport = viewportRef.current
  if (!viewport) return
  setViewportW(viewport.clientWidth)
  const observer = new ResizeObserver((entries) => {
   setViewportW(entries[0].contentRect.width)
  })
  observer.observe(viewport)
  return () => observer.disconnect()
 }, [])

 // Preview selalu 100% (1:1 dengan A4 fisik 210mm × 297mm) — tanpa auto-fit
 // responsif: ukuran lembar tidak pernah mengikuti lebar viewport. Zoom hanya
 // berubah lewat kontrol eksplisit pengguna (tombol/roda/double-click).
 const zoom = zoomOverride ?? 1
 const percent = Math.round(zoom * 100)

 // Klip ulang pan saat zoom/viewport berubah agar lembar tak keluar pandangan.
 useEffect(() => {
  const viewport = viewportRef.current
  const content = contentRef.current
  setPan((prev) => {
   const next = clampPan(
    prev,
    zoom,
    sheetWidth,
    viewport?.clientWidth ?? 0,
    viewport?.clientHeight ?? 0,
    content?.offsetHeight ?? 0,
   )
   return next.x === prev.x && next.y === prev.y ? prev : next
  })
 }, [zoom, viewportW, sheetWidth])

 // Ctrl/⌘ + roda memperbesar/mengecilkan. Listener non-passive agar
 // preventDefault benar-benar menahan zoom browser bawaan.
 useEffect(() => {
  const viewport = viewportRef.current
  if (!viewport) return
  const handleWheel = (event: WheelEvent) => {
   if (!event.ctrlKey && !event.metaKey) return
   event.preventDefault()
   setZoomOverride(stepZoom(zoom, event.deltaY < 0 ? 1 : -1))
  }
  viewport.addEventListener('wheel', handleWheel, { passive: false })
  return () => viewport.removeEventListener('wheel', handleWheel)
 }, [zoom])

 const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (dragRef.current) return
  dragRef.current = {
   pointerId: event.pointerId,
   startX: event.clientX,
   startY: event.clientY,
   originX: pan.x,
   originY: pan.y,
  }
  event.currentTarget.setPointerCapture(event.pointerId)
  setDragging(true)
 }

 const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
  const drag = dragRef.current
  if (!drag || drag.pointerId !== event.pointerId) return
  const viewport = viewportRef.current
  const content = contentRef.current
  setPan(
   clampPan(
    {
     x: drag.originX + event.clientX - drag.startX,
     y: drag.originY + event.clientY - drag.startY,
    },
    zoom,
    sheetWidth,
    viewport?.clientWidth ?? 0,
    viewport?.clientHeight ?? 0,
    content?.offsetHeight ?? 0,
   ),
  )
 }

 const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
  const drag = dragRef.current
  if (!drag || drag.pointerId !== event.pointerId) return
  dragRef.current = null
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
   event.currentTarget.releasePointerCapture(event.pointerId)
  }
  setDragging(false)
 }

 return (
  <div
   ref={viewportRef}
   className={cn(
    'relative min-h-screen w-full overflow-hidden bg-gray-200 select-none touch-none',
    dragging ? 'cursor-grabbing' : 'cursor-grab',
   )}
   onPointerDown={handlePointerDown}
   onPointerMove={handlePointerMove}
   onPointerUp={handlePointerEnd}
   onPointerCancel={handlePointerEnd}
   onDoubleClick={() => setZoomOverride(1)}
  >
   {/* Lembar berlebar tetap — hanya transform (skala + geser), tanpa resize. */}
   <div
    className="absolute inset-0 flex items-start justify-center"
    style={{
     transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
     transformOrigin: 'top center',
     willChange: 'transform',
    }}
   >
    <div ref={contentRef} style={{ width: sheetWidth, flexShrink: 0 }}>
     {children}
    </div>
   </div>

   <div
    className="fixed top-4 right-4 z-50 no-print flex items-center gap-1 rounded-2xl border border-outline-variant bg-surface p-1.5 shadow-lg"
    onPointerDown={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
   >
    <Button
     variant="secondary"
     size="sm"
     className="px-2"
     tooltip={t('parent.report.zoomOut')}
     disabled={zoom <= ZOOM_MIN + 1e-9}
     onClick={() => setZoomOverride(stepZoom(zoom, -1))}
     icon={<ZoomOut className="h-4 w-4" aria-label={t('parent.report.zoomOut')} />}
    />
    <span
     aria-live="polite"
     title={t('parent.report.zoomLevel', { value: `${percent}%` })}
     className="min-w-[3.5rem] text-center text-sm font-medium tabular-nums text-on-surface-variant"
    >
     {percent}%
    </span>
    <Button
     variant="secondary"
     size="sm"
     className="px-2"
     tooltip={t('parent.report.zoomIn')}
     disabled={zoom >= ZOOM_MAX - 1e-9}
     onClick={() => setZoomOverride(stepZoom(zoom, 1))}
     icon={<ZoomIn className="h-4 w-4" aria-label={t('parent.report.zoomIn')} />}
    />
    <Button
     variant="secondary"
     size="sm"
     className="px-2"
     tooltip={t('parent.report.zoomReset')}
     onClick={() => setZoomOverride(null)}
     icon={<RotateCcw className="h-4 w-4" aria-label={t('parent.report.zoomReset')} />}
    />
   </div>
  </div>
 )
}

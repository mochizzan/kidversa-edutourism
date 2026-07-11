import { toBlob, toCanvas } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { A4_SHEET_WIDTH } from '../constants/report'

// ─── Readiness helpers (used by createRaportIframe) ───

// Polls for the pre-compiled Tailwind CSS to be applied. With static CSS (no CDN
// runtime) the stylesheet applies synchronously on HTML parse, so this usually
// resolves on the first poll. Verifies both body flex display and the
// arbitrary-value utility max-w-[${A4_SHEET_WIDTH}px] on .a4-sheet before capture.
async function waitForStyles(doc: Document, timeout = 3000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const body = doc.body
    if (body) {
      const display = doc.defaultView?.getComputedStyle(body).display
      if (display === 'flex') {
        const sheet = doc.querySelector('.a4-sheet') as HTMLElement | null
        if (sheet) {
          const mw = doc.defaultView?.getComputedStyle(sheet).maxWidth
          if (mw === `${A4_SHEET_WIDTH}px`) return
        } else {
          return // fallback: .a4-sheet not found
        }
      }
    }
    await new Promise((r) => setTimeout(r, 100))
  }
}

// Polls until the FontAwesome SVG+JS scripts have converted every <i class="fa-*">
// element into an inline <svg>. Timeouts are non-fatal: if some icons remain
// unconverted, capture proceeds anyway rather than hanging forever.
async function waitForSVGConversion(doc: Document, timeout = 3000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const remaining = doc.querySelectorAll('i[class*="fa-"]')
    if (remaining.length === 0) return
    await new Promise((r) => setTimeout(r, 50))
  }
}

// ─── Shared hidden iframe creation ───

// Renders the given mini raport HTML off-screen in a hidden iframe (via srcDoc so
// scripts execute), waits for web fonts, the FontAwesome SVG conversion, and the
// pre-compiled Tailwind CSS to be applied, then resolves with the .a4-sheet target
// element.
async function createRaportIframe(html: string): Promise<{
  target: HTMLElement
  cleanup: () => void
}> {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '0'
  iframe.style.width = `${A4_SHEET_WIDTH}px` // A4 width at 96dpi
  iframe.style.border = 'none'
  iframe.srcdoc = html

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }

    iframe.onload = async () => {
      try {
        const doc = iframe.contentDocument
        if (!doc) {
          cleanup()
          reject(new Error('Gagal memuat dokumen raport.'))
          return
        }

        // 1. Wait for web fonts (local Nunito, Caveat).
        await doc.fonts.ready

        // 2. Wait for FontAwesome SVG+JS to convert <i> → <svg>.
        await waitForSVGConversion(doc)

        // 3. Wait for the pre-compiled Tailwind CSS to be applied.
        await waitForStyles(doc)

        // 4. Paint buffer — let the browser render all glyphs before capture.
        await new Promise((r) => setTimeout(r, 500))

        // 5. Capture-only overrides (NOT applied to the on-screen document or print):
        // remove the outer sheet's rounded corners, shadow, ring, and body padding so
        // the A4 sheet fills the capture edge-to-edge with sharp corners. Inner cards
        // keep their decorative radius. !important beats the inline computed styles
        // that html-to-image copies onto the cloned node.
        const captureOverride = doc.createElement('style')
        captureOverride.textContent = `
          body {
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            background: #ffffff !important;
          }
          .a4-sheet {
            border-radius: 0 !important;
            box-shadow: none !important;
            width: ${A4_SHEET_WIDTH}px !important;
            max-width: ${A4_SHEET_WIDTH}px !important;
            min-height: 1123px !important;
            display: flex !important;
            flex-direction: column !important;
          }
          .a4-sheet > :last-child {
            border-radius: 0 !important;
          }
        `
        doc.head.appendChild(captureOverride)

        const target = doc.querySelector('.a4-sheet') as HTMLElement | null
        if (!target) {
          cleanup()
          reject(new Error('Gagal menemukan konten raport.'))
          return
        }

        resolve({ target, cleanup })
      } catch (err) {
        cleanup()
        reject(err)
      }
    }

    document.body.appendChild(iframe)
  })
}

// ─── Shared capture options ───

const CAPTURE_OPTIONS = {
  pixelRatio: 2,
  cacheBust: true,
}

// ─── Public API ───

// Captures an already-rendered DOM element as a PNG blob (transparent background).
export async function captureElementAsBlob(element: HTMLElement): Promise<Blob> {
  const blob = await toBlob(element, {
    ...CAPTURE_OPTIONS,
  })
  if (!blob) throw new Error('Gagal menghasilkan gambar raport.')
  return blob
}

// Renders the given mini raport HTML in a hidden iframe, waits for readiness, then
// captures the .a4-sheet as a PNG blob.
export async function captureRaportAsBlob(html: string): Promise<Blob> {
  const { target, cleanup } = await createRaportIframe(html)
  try {
    return await captureElementAsBlob(target)
  } finally {
    cleanup()
  }
}

// Captures an already-rendered DOM element as a real PDF file (A4, opaque white
// background) and triggers a download.
export async function captureElementAsPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const canvas = await toCanvas(element, {
    ...CAPTURE_OPTIONS,
    backgroundColor: '#ffffff',
  })

  const imgData = canvas.toDataURL('image/png')
  const pxToMm = 25.4 / 96 // 1px at 96dpi → mm
  const imgWidthMm = canvas.width * pxToMm
  const imgHeightMm = canvas.height * pxToMm

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const scale = Math.min(210 / imgWidthMm, 297 / imgHeightMm)
  const finalWidth = imgWidthMm * scale
  const finalHeight = imgHeightMm * scale
  const offsetX = (210 - finalWidth) / 2
  const offsetY = (297 - finalHeight) / 2

  pdf.addImage(imgData, 'PNG', offsetX, offsetY, finalWidth, finalHeight)
  pdf.save(filename)
}

// Renders the given mini raport HTML in a hidden iframe, waits for readiness, then
// generates a real PDF file download.
export async function captureRaportAsPdf(
  html: string,
  filename: string
): Promise<void> {
  const { target, cleanup } = await createRaportIframe(html)
  try {
    await captureElementAsPdf(target, filename)
  } finally {
    cleanup()
  }
}

// ─── Download helper ───

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

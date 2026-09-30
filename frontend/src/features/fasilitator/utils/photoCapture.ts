/**
 * Pure canvas helpers for the smart photo flow (capture geometry + editor
 * composition). No DOM/browser globals — safe to unit test in isolation.
 */

/** Source rectangle (in video pixels) of the capture. */
export interface CaptureCrop {
 sx: number
 sy: number
 sw: number
 sh: number
}

/** Target aspect ratio of every capture: 9:16 portrait. */
const TARGET_RATIO = 9 / 16

/**
 * Centered maximum-area 9:16 source rectangle fully inside the video.
 *
 * - video wider than 9:16  → fit to height (centered horizontal crop)
 * - video taller than 9:16 → fit to width  (centered vertical crop)
 *
 * Center offsets are rounded down; sw/sh are positive integers within
 * [0, videoWidth] × [0, videoHeight].
 */
export function computeCaptureCrop(videoWidth: number, videoHeight: number): CaptureCrop {
 const w = Number.isFinite(videoWidth) && videoWidth >= 1 ? Math.floor(videoWidth) : 1
 const h = Number.isFinite(videoHeight) && videoHeight >= 1 ? Math.floor(videoHeight) : 1

 let sw: number
 let sh: number
 if (w / h >= TARGET_RATIO) {
  // Wider than 9:16 → height binds.
  sh = h
  sw = Math.round(h * TARGET_RATIO)
 } else {
  // Taller than 9:16 → width binds.
  sw = w
  sh = Math.round(w * (16 / 9))
 }

 // Integer-rounding safety: never leave the video bounds.
 sw = Math.min(sw, w)
 sh = Math.min(sh, h)

 return {
  sx: Math.floor((w - sw) / 2),
  sy: Math.floor((h - sh) / 2),
  sw,
  sh,
 }
}

/**
 * Draws the cropped region of `video` stretched over the whole canvas
 * (destination size equals the crop's own pixel size).
 *
 * When `mirror` is true the crop is drawn horizontally flipped (via a
 * save/translate/scale/restore transform) so the captured pixels match a
 * mirrored preview. Crop geometry is unchanged. Defaults to false.
 */
export function drawVideoCrop(
 ctx: CanvasRenderingContext2D,
 video: CanvasImageSource,
 crop: CaptureCrop,
 mirror = false,
): void {
 if (mirror) {
  ctx.save()
  ctx.translate(crop.sw, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh)
  ctx.restore()
  return
 }
 ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh)
}

/**
 * Flat editor composition: draws the frame-free base over the whole canvas
 * and, when given, the frame stretched to exactly the same rectangle — so
 * the canvas always holds ONE whole image (base, or base + one frame).
 *
 * The canvas must already be sized to the base's 9:16 dimensions (the caller
 * sizes it from the base image before calling); composition never resizes it.
 * Sources arrive as parameters — callers handle image loading and errors.
 */
export function composePhoto(
 ctx: CanvasRenderingContext2D,
 opts: { base: CanvasImageSource; frame?: CanvasImageSource | null },
): void {
 const { width, height } = ctx.canvas
 ctx.drawImage(opts.base, 0, 0, width, height)
 if (opts.frame) ctx.drawImage(opts.frame, 0, 0, width, height)
}

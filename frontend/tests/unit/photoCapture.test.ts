import { describe, expect, it } from 'vitest'
import { computeCaptureCrop, drawVideoCrop } from '../../src/features/fasilitator/utils/photoCapture'

describe('computeCaptureCrop', () => {
  it('returns the full frame for an exact 9:16 video', () => {
    expect(computeCaptureCrop(720, 1280)).toEqual({ sx: 0, sy: 0, sw: 720, sh: 1280 })
    expect(computeCaptureCrop(9, 16)).toEqual({ sx: 0, sy: 0, sw: 9, sh: 16 })
    expect(computeCaptureCrop(1080, 1920)).toEqual({ sx: 0, sy: 0, sw: 1080, sh: 1920 })
  })

  it('crops a centered vertical band from a 16:9 landscape video', () => {
    const crop = computeCaptureCrop(1920, 1080)
    // Fits to height: full height, width = round(1080 * 9/16) = 608
    expect(crop).toEqual({ sx: 656, sy: 0, sw: 608, sh: 1080 })
    expect(crop.sx).toBe(Math.floor((1920 - 608) / 2))
  })

  it('crops a centered horizontal band when the video is taller than 9:16', () => {
    const crop = computeCaptureCrop(720, 2000)
    // Fits to width: full width, height = round(720 * 16/9) = 1280
    expect(crop).toEqual({ sx: 0, sy: 360, sw: 720, sh: 1280 })
    expect(crop.sy).toBe(Math.floor((2000 - 1280) / 2))
  })

  it('rounds center offsets down when the slack is odd', () => {
    // 100/181 ≈ 0.552 < 9/16 → width-fit: sw=100, sh=round(177.78)=178, sy=floor(3/2)=1
    expect(computeCaptureCrop(100, 181)).toEqual({ sx: 0, sy: 1, sw: 100, sh: 178 })
  })

  it('handles tiny and degenerate sizes with positive in-bounds crops', () => {
    expect(computeCaptureCrop(1, 1)).toEqual({ sx: 0, sy: 0, sw: 1, sh: 1 })
    expect(computeCaptureCrop(10, 10)).toEqual({ sx: 2, sy: 0, sw: 6, sh: 10 })
    expect(computeCaptureCrop(3, 5)).toEqual({ sx: 0, sy: 0, sw: 3, sh: 5 })
    // Non-positive / non-finite input is sanitized to a 1×1 crop
    expect(computeCaptureCrop(0, 0)).toEqual({ sx: 0, sy: 0, sw: 1, sh: 1 })
    expect(computeCaptureCrop(-5, Number.NaN)).toEqual({ sx: 0, sy: 0, sw: 1, sh: 1 })
  })

  it('keeps crop invariants across many aspect ratios', () => {
    const sizes = [
      [720, 1280],
      [1920, 1080],
      [1280, 720],
      [640, 480],
      [480, 640],
      [100, 1000],
      [1000, 100],
      [1, 1],
      [16, 9],
      [9, 16],
      [333, 999],
      [500, 333],
      [3840, 2160],
      [1080, 1920],
      [101, 181],
      [3, 5],
    ] as const

    for (const [w, h] of sizes) {
      const { sx, sy, sw, sh } = computeCaptureCrop(w, h)
      // Positive integers within the video bounds
      expect(sw).toBeGreaterThan(0)
      expect(sh).toBeGreaterThan(0)
      expect(Number.isInteger(sw)).toBe(true)
      expect(Number.isInteger(sh)).toBe(true)
      expect(sw).toBeLessThanOrEqual(w)
      expect(sh).toBeLessThanOrEqual(h)
      // Fully inside the video, centered offsets floored
      expect(sx).toBeGreaterThanOrEqual(0)
      expect(sy).toBeGreaterThanOrEqual(0)
      expect(sx + sw).toBeLessThanOrEqual(w)
      expect(sy + sh).toBeLessThanOrEqual(h)
      // 9:16 within one pixel of rounding error
      expect(Math.abs(sw / sh - 9 / 16) * sh).toBeLessThanOrEqual(1)
    }
  })
})

describe('drawVideoCrop mirror', () => {
  const video = {} as CanvasImageSource
  const crop = { sx: 12, sy: 34, sw: 608, sh: 1080 }

  /** Records every transform/draw method call in order on a mock 2D ctx. */
  function recordingCtx() {
    const calls: string[][] = []
    const args: Record<string, unknown[]> = {}
    const ctx = {
      save: () => {
        calls.push(['save'])
      },
      translate: (x: number, y: number) => {
        calls.push(['translate'])
        args.translate = [x, y]
      },
      scale: (x: number, y: number) => {
        calls.push(['scale'])
        args.scale = [x, y]
      },
      drawImage: (...rest: unknown[]) => {
        calls.push(['drawImage'])
        args.drawImage = rest
      },
      restore: () => {
        calls.push(['restore'])
      },
    }
    return { calls, args, ctx: ctx as unknown as CanvasRenderingContext2D }
  }

  it('mirror: true wraps the draw in save/translate/scale/restore in order', () => {
    const { calls, args, ctx } = recordingCtx()

    drawVideoCrop(ctx, video, crop, true)

    expect(calls).toEqual([['save'], ['translate'], ['scale'], ['drawImage'], ['restore']])
    // translate width = crop output width (canvas is sw×sh); flip about x=0
    expect(args.translate).toEqual([crop.sw, 0])
    expect(args.scale).toEqual([-1, 1])
  })

  it('mirror: false or omitted draws without any transform calls', () => {
    for (const mirror of [false, undefined] as const) {
      const { calls, ctx } = recordingCtx()

      if (mirror === undefined) drawVideoCrop(ctx, video, crop)
      else drawVideoCrop(ctx, video, crop, mirror)

      expect(calls).toEqual([['drawImage']])
    }
  })

  it('mirror does not change crop geometry: drawImage args are identical', () => {
    const plain = recordingCtx()
    drawVideoCrop(plain.ctx, video, crop, false)

    const mirrored = recordingCtx()
    drawVideoCrop(mirrored.ctx, video, crop, true)

    expect(mirrored.args.drawImage).toEqual(plain.args.drawImage)
    // Same sw/sh/sx/sy source rectangle and full-size destination
    expect(mirrored.args.drawImage).toEqual([
      video,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      crop.sw,
      crop.sh,
    ])
  })
})

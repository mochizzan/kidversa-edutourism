import { describe, expect, it, vi } from 'vitest'
import { composePhoto } from '../../src/features/fasilitator/utils/photoCapture'

type DrawCall = [CanvasImageSource, number, number, number, number]

/** Recording stand-in for CanvasRenderingContext2D — no real canvas needed. */
function makeCtx(width: number, height: number) {
  const canvas = { width, height }
  const calls: DrawCall[] = []
  const drawImage = vi.fn((...args: DrawCall) => {
    calls.push(args)
  })
  const ctx = { canvas, drawImage } as unknown as CanvasRenderingContext2D
  return { canvas, ctx, calls, drawImage }
}

const source = (name: string) => ({ name }) as unknown as CanvasImageSource

describe('composePhoto', () => {
  it('with a frame: draws the base first, then exactly one frame stretched over the full canvas', () => {
    const { ctx, calls } = makeCtx(720, 1280)
    const base = source('base')
    const frame = source('frame')

    composePhoto(ctx, { base, frame })

    expect(calls).toEqual([
      [base, 0, 0, 720, 1280],
      [frame, 0, 0, 720, 1280],
    ])
    expect(calls.filter((c) => c[0] === frame)).toHaveLength(1)
  })

  it('without a frame: draws only the base', () => {
    const { ctx, calls, drawImage } = makeCtx(1080, 1920)
    const base = source('base')

    composePhoto(ctx, { base })
    composePhoto(ctx, { base, frame: null })

    expect(calls).toEqual([
      [base, 0, 0, 1080, 1920],
      [base, 0, 0, 1080, 1920],
    ])
    expect(drawImage).toHaveBeenCalledTimes(2)
  })

  it('re-compose after a frame change never stacks frames and always redraws from the base', () => {
    const { ctx, calls } = makeCtx(720, 1280)
    const base = source('base')
    const frameA = source('frameA')
    const frameB = source('frameB')

    composePhoto(ctx, { base, frame: frameA })
    const afterFirst = calls.length
    composePhoto(ctx, { base, frame: frameB })
    const secondCompose = calls.slice(afterFirst)

    // Second compose starts from the base and draws exactly ONE (new) frame —
    // the previous frame is never stacked on top of the old composite.
    expect(secondCompose).toEqual([
      [base, 0, 0, 720, 1280],
      [frameB, 0, 0, 720, 1280],
    ])
    expect(calls.filter((c) => c[0] === frameA)).toHaveLength(1)
    expect(calls.filter((c) => c[0] === frameB)).toHaveLength(1)

    // Clearing the frame recomposes from the base alone.
    const afterSecond = calls.length
    composePhoto(ctx, { base })
    expect(calls.slice(afterSecond)).toEqual([[base, 0, 0, 720, 1280]])
    expect(calls.slice(afterSecond).some((c) => c[0] === frameA || c[0] === frameB)).toBe(false)
  })

  it('keeps the canvas at the 9:16 base dimensions and fills exactly that rect', () => {
    // The page sizes the editor canvas to the base capture (9:16) first.
    const { canvas, ctx, calls } = makeCtx(720, 1280)
    const base = source('base')
    const frame = source('frame')
    expect(canvas.width / canvas.height).toBe(9 / 16)

    composePhoto(ctx, { base, frame })

    // Composition never resizes the canvas away from the base's dims …
    expect(canvas.width).toBe(720)
    expect(canvas.height).toBe(1280)
    // … and every draw targets exactly that rect.
    for (const call of calls) {
      expect(call.slice(1)).toEqual([0, 0, 720, 1280])
    }
  })

  it('a frame whose aspect ratio is not 9:16 still fills exactly one full-canvas rect', () => {
    const { ctx, calls } = makeCtx(720, 1280)
    const base = source('base')
    // Square and landscape frames: neither matches the 9:16 canvas.
    const square = { name: 'square', width: 512, height: 512 } as unknown as CanvasImageSource
    const landscape = { name: 'landscape', width: 1024, height: 768 } as unknown as CanvasImageSource

    composePhoto(ctx, { base, frame: square })
    expect(calls).toEqual([
      [base, 0, 0, 720, 1280],
      [square, 0, 0, 720, 1280],
    ])
    // Exactly ONE frame draw spanning the whole canvas — a mismatched frame
    // can't leave gaps, offset, or double-draw over the base.
    expect(calls.filter((c) => c[0] === square)).toHaveLength(1)
    expect(calls[1].slice(1)).toEqual([0, 0, 720, 1280])

    composePhoto(ctx, { base, frame: landscape })
    expect(calls.slice(2)).toEqual([
      [base, 0, 0, 720, 1280],
      [landscape, 0, 0, 720, 1280],
    ])
    expect(calls.filter((c) => c[0] === landscape)).toHaveLength(1)
  })
})

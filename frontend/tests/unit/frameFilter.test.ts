import { describe, it, expect, vi, afterEach } from 'vitest'
import { filterFramesForProgram } from '@/features/fasilitator/utils/frameFilter'
import type { PhotoFrame } from '@/core/types'

const makeFrame = (overrides: Partial<PhotoFrame> & { id: string }): PhotoFrame => ({
  tenant_id: 'tenant-1',
  name: `Frame ${overrides.id}`,
  file_url: `/api/media/frame/${overrides.id}`,
  is_active: true,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const ownFrame = makeFrame({ id: 'own', program_id: 'prog-1' })
const otherFrame = makeFrame({ id: 'other', program_id: 'prog-2' })
const globalEmpty = makeFrame({ id: 'global-empty', program_id: '' })
const globalMissing = makeFrame({ id: 'global-missing' })
const inactiveOwn = makeFrame({ id: 'inactive', program_id: 'prog-1', is_active: false })

const ids = (frames: PhotoFrame[]) => frames.map((f) => f.id)

describe('filterFramesForProgram', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps own-program frames plus global frames and drops other-program frames', () => {
    const result = filterFramesForProgram(
      [ownFrame, otherFrame, globalEmpty, globalMissing],
      'prog-1',
    )
    expect(ids(result).sort()).toEqual(['global-empty', 'global-missing', 'own'])
  })

  it('excludes inactive frames even when they belong to the program', () => {
    const result = filterFramesForProgram([ownFrame, inactiveOwn, globalEmpty], 'prog-1')
    expect(ids(result)).toEqual(['own', 'global-empty'])
  })

  it('drops everything non-global when programId is undefined, with a console warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
    const result = filterFramesForProgram([ownFrame, otherFrame, globalEmpty, globalMissing], undefined)
    expect(ids(result).sort()).toEqual(['global-empty', 'global-missing'])
    expect(warn).toHaveBeenCalledWith(
      '[FrameFilter] program context unknown; showing only global frames',
    )
  })

  it('drops everything non-global when programId is null, with a console warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
    const result = filterFramesForProgram([ownFrame, otherFrame, globalEmpty], null)
    expect(ids(result)).toEqual(['global-empty'])
    expect(warn).toHaveBeenCalledWith(
      '[FrameFilter] program context unknown; showing only global frames',
    )
  })

  it("drops everything non-global when programId is '', with a console warning", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
    const result = filterFramesForProgram([ownFrame, otherFrame, globalEmpty, globalMissing], '')
    expect(ids(result).sort()).toEqual(['global-empty', 'global-missing'])
    expect(warn).toHaveBeenCalledWith(
      '[FrameFilter] program context unknown; showing only global frames',
    )
  })

  it('does not warn when the program context is known', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
    filterFramesForProgram([ownFrame, otherFrame], 'prog-1')
    expect(warn).not.toHaveBeenCalled()
  })
})

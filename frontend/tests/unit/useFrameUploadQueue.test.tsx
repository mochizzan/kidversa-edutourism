import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, useState } from 'react'
import { render, renderHook } from './test-utils'
import {
  useFrameUploadQueue,
  type UseFrameUploadQueueResult,
} from '@/features/admin/hooks/useFrameUploadQueue'
import { FrameDropZone } from '@/features/admin/components/FrameDropZone'
import type { PhotoFrame } from '@/core/types'
import { ROUTES } from '@/core/constants/app'

// ── Mock factories must not reference outer-scope variables.
// vi.hoisted creates the mock fakes so they can be shared between the
// vi.mock factories below and the test bodies.
const { mockNavigate, mockFrameUpload, mockTenantScope } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockFrameUpload: vi.fn(),
  mockTenantScope: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/core/hooks/useTenantScope', () => ({
  useTenantScope: () => mockTenantScope(),
}))

vi.mock('@/core/services/frames', () => ({
  frameService: {
    upload: (...args: unknown[]) => mockFrameUpload(...args),
  },
}))

// ApiError replica — must match the real constructor signature so that
// `instanceof ApiError` checks in uploadMultipart work at runtime.
vi.mock('@/core/services/backend-client', () => {
  class ApiError extends Error {
    code: string
    status: number
    constructor(message: string, code: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.code = code
      this.status = status
    }
  }
  return { ApiError }
})

import { ApiError } from '@/core/services/backend-client'

// ── Named mock interfaces (no ReturnType<typeof fn>) ──────────────────────
interface TenantScope {
  tenantId: string | null
  activeTenant: null
  requiresSelection: boolean
  canAccessOperationalData: boolean
}

function makeTenantScope(overrides: Partial<TenantScope> = {}): TenantScope {
  return {
    tenantId: 'tenant-1',
    activeTenant: null,
    requiresSelection: false,
    canAccessOperationalData: true,
    ...overrides,
  }
}

function makePhotoFrame(): PhotoFrame {
  return {
    id: 'f-1',
    tenant_id: 'tenant-1',
    name: 'Uploaded Frame',
    file_url: 'http://example.com/frame.png',
    is_active: true,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00Z',
  }
}

// ── URL.createObjectURL / revokeObjectURL stubs ──────────────────────────
// Return unique URLs so the hook's previewUrlsRef Set doesn't deduplicate them
let urlCounter = 0
const mockCreateObjectURL = vi.fn((): string => `blob:mock-url-${urlCounter++}`)
const mockRevokeObjectURL = vi.fn()
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

describe('useFrameUploadQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    urlCounter = 0
    mockTenantScope.mockReturnValue(makeTenantScope())

    Object.defineProperty(URL, 'createObjectURL', {
      value: mockCreateObjectURL,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: mockRevokeObjectURL,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: originalCreateObjectURL,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: originalRevokeObjectURL,
      configurable: true,
      writable: true,
    })
  })

  it('processes valid files and creates preview URLs', () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'my-frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].name).toBe('My Frame')
    expect(result.current.items[0].preview).toBe('blob:mock-url-0')
    expect(result.current.warnings).toHaveLength(0)
  })

  // Regression (systematic-debugging; root cause confirmed on the deployed :8002
  // production bundle): FrameDropZone.handleFileSelect calls
  // onFilesSelected(input.files) and then input.value = '', which EMPTIES the
  // same live FileList. React only evaluates the setItems updater eagerly (at
  // dispatch time) when the component fiber has no pending lanes; with another
  // update queued — on the real page a late data-fetch setState — the updater
  // runs at the NEXT render, i.e. after the clear, and Array.from(fileList)
  // sees 0 files → no card ever appears. The files/value wiring below mirrors
  // real <input type="file"> semantics: assigning value = '' empties the list.
  it('adds the card when change fires while another update is pending (click path)', () => {
    let queue: UseFrameUploadQueueResult | undefined
    let markPendingUpdate: (() => void) | undefined

    function UploadHarness() {
      queue = useFrameUploadQueue()
      const [, setTick] = useState(0)
      markPendingUpdate = () => setTick((t) => t + 1)
      return <FrameDropZone onFilesSelected={queue.processFiles} />
    }

    const { container } = render(<UploadHarness />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    let selected: File[] = [new File(['x'], 'click-frame.png', { type: 'image/png' })]
    const liveFileList = {
      get length() { return selected.length },
      [Symbol.iterator]: function*() { yield* selected },
    } as unknown as FileList
    Object.defineProperty(input, 'files', { configurable: true, get: () => liveFileList })
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => (selected.length > 0 ? 'C:\\fakepath\\click-frame.png' : ''),
      set: () => { selected = [] },
    })

    act(() => {
      // Leave an update pending on the harness fiber so React defers the
      // setItems updater until the render that closes this act().
      markPendingUpdate?.()
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(queue!.items).toHaveLength(1)
    expect(queue!.items[0].name).toBe('Click Frame')
  })

  it('accepts JPEG files as valid', () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'photo.jpeg', { type: 'image/jpeg' })
    act(() => {
      result.current.processFiles([file])
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].name).toBe('Photo')
    expect(result.current.warnings).toHaveLength(0)
  })

  it('skips files with unsupported types and records a warning', () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.gif', { type: 'image/gif' })
    act(() => {
      result.current.processFiles([file])
    })

    expect(result.current.items).toHaveLength(0)
    expect(result.current.warnings).toHaveLength(1)
    expect(result.current.warnings[0]).toContain('bukan file PNG/JPEG')
  })

  it('skips files exceeding the 2 MB size limit', () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    const largeFile = new File(['x'.repeat(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([largeFile])
    })

    expect(result.current.items).toHaveLength(0)
    expect(result.current.warnings[0]).toContain('melebihi batas 2 MB')
  })

  it('skips duplicate files within the same batch', () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    const file1 = new File(['hello'], 'frame.png', { type: 'image/png' })
    const file2 = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file1, file2])
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.warnings).toHaveLength(1)
    expect(result.current.warnings[0]).toContain('sudah ada')
  })

  it('sets errorMessage when tenantId is null during save', async () => {
    mockTenantScope.mockReturnValue(
      makeTenantScope({ tenantId: null }),
    )

    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    await act(async () => {
      await result.current.handleSaveAll()
    })

    expect(result.current.errorMessage).toBeDefined()
    expect(result.current.errorMessage).toContain('Tenant')
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockFrameUpload).not.toHaveBeenCalled()
  })

  it('sets errorMessage when ApiError is thrown during save', async () => {
    mockFrameUpload.mockRejectedValueOnce(
      new ApiError('Unauthorized', 'unauthorized', 401),
    )

    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    await act(async () => {
      await result.current.handleSaveAll()
    })

    expect(result.current.errorMessage).toBe('Unauthorized')
    expect(result.current.isSaving).toBe(false)
  })

  it('sets generic errorMessage on non-ApiError failure', async () => {
    mockFrameUpload.mockRejectedValueOnce(new Error('Something went wrong'))

    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    await act(async () => {
      await result.current.handleSaveAll()
    })

    expect(result.current.errorMessage).toBe('Gagal menyimpan frame. Silakan coba lagi.')
  })

  it('navigates to frames list on successful save', async () => {
    mockFrameUpload.mockResolvedValue(makePhotoFrame())

    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    await act(async () => {
      await result.current.handleSaveAll()
    })

    expect(mockFrameUpload).toHaveBeenCalledTimes(1)
    expect(mockFrameUpload).toHaveBeenCalledWith({
      name: 'Frame',
      programId: undefined,
      file: file,
    })
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.ADMIN.FRAMES)
    expect(result.current.isSaving).toBe(false)
    expect(result.current.errorMessage).toBeNull()
  })

  it('passes programId to upload when set', async () => {
    mockFrameUpload.mockResolvedValue(makePhotoFrame())

    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    act(() => {
      result.current.handleUpdateProgram(result.current.items[0].id, 'prog-1')
    })

    await act(async () => {
      await result.current.handleSaveAll()
    })

    expect(mockFrameUpload).toHaveBeenCalledWith({
      name: 'Frame',
      programId: 'prog-1',
      file: file,
    })
  })

  it('skips save when any item has an empty name', async () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    act(() => {
      result.current.handleUpdateName(result.current.items[0].id, '   ')
    })

    await act(async () => {
      await result.current.handleSaveAll()
    })

    expect(mockFrameUpload).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('skips save when queue is empty', async () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    await act(async () => {
      await result.current.handleSaveAll()
    })

    expect(mockFrameUpload).not.toHaveBeenCalled()
  })

  it('handleRemove revokes the object URL', () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    const id = result.current.items[0].id
    const previewUrl = result.current.items[0].preview

    act(() => {
      result.current.handleRemove(id)
    })

    expect(result.current.items).toHaveLength(0)
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(previewUrl)
  })

  it('handleClearAll revokes all object URLs and empties the queue', () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    const file1 = new File(['hello1'], 'a.png', { type: 'image/png' })
    const file2 = new File(['hello2'], 'b.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file1, file2])
    })

    expect(result.current.items).toHaveLength(2)

    act(() => {
      result.current.handleClearAll()
    })

    expect(result.current.items).toHaveLength(0)
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('handleUpdateName updates an item name', () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    const id = result.current.items[0].id

    act(() => {
      result.current.handleUpdateName(id, 'Custom Name')
    })

    expect(result.current.items[0].name).toBe('Custom Name')
  })

  it('hasEmptyName is false when all items have non-empty names', () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    expect(result.current.hasEmptyName).toBe(false)

    const file = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    expect(result.current.hasEmptyName).toBe(false)
  })

  it('hasEmptyName is true when any item has an empty name', () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    act(() => {
      result.current.handleUpdateName(result.current.items[0].id, '')
    })

    expect(result.current.hasEmptyName).toBe(true)
  })

  it('clearWarnings removes all warnings', () => {
    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.gif', { type: 'image/gif' })
    act(() => {
      result.current.processFiles([file])
    })

    expect(result.current.warnings).toHaveLength(1)

    act(() => {
      result.current.clearWarnings()
    })

    expect(result.current.warnings).toHaveLength(0)
  })

  it('clearErrorMessage removes the error', async () => {
    mockTenantScope.mockReturnValue(
      makeTenantScope({ tenantId: null }),
    )

    const { result } = renderHook(() => useFrameUploadQueue())

    const file = new File(['hello'], 'frame.png', { type: 'image/png' })
    act(() => {
      result.current.processFiles([file])
    })

    await act(async () => {
      await result.current.handleSaveAll()
    })

    expect(result.current.errorMessage).toBeDefined()

    act(() => {
      result.current.clearErrorMessage()
    })

    expect(result.current.errorMessage).toBeNull()
  })
})

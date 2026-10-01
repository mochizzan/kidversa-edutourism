import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from './test-utils'
import { useSmartPhotos } from '@/features/fasilitator/hooks/useSmartPhotos'
import { photoService } from '@/core/services/photos'
import { ApiError } from '@/core/services/backend-client'
import type { Participant, SmartPhoto } from '@/core/types'

// Mock the service layer only — the hook's upload flow (File construction,
// progress forwarding, follow-up steps, list refresh, error propagation) runs
// for real. ApiError is the real class (backend-client is not mocked), so
// `instanceof` checks in consumers see the exact object that propagated.
vi.mock('@/core/services/photos', () => ({
  photoService: {
    getByParticipant: vi.fn(),
    getBySession: vi.fn(),
    getReportPicks: vi.fn(),
    setReportPick: vi.fn(),
    clearReportPick: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
    update: vi.fn(),
    setReportPhoto: vi.fn(),
  },
}))

const participant: Participant = {
  id: 'part-1',
  session_id: 'sess-1',
  child_name: 'Bela',
  child_age: 8,
  parent_name: 'Budi',
  parent_phone: '081234567890',
  consent_photo: true,
  created_at: '2026-10-01T00:00:00Z',
}

const uploadedPhoto: SmartPhoto = {
  id: 'photo-1',
  participant_id: 'part-1',
  session_id: 'sess-1',
  original_file_url: 'photos/stored.png',
  is_report_photo: false,
  taken_by: 'user-1',
  taken_at: '2026-10-01T00:00:00Z',
}

// PNG magic bytes + payload — the exact bytes that must reach the wire.
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04,
])

const baseArgs = {
  childId: 'child-1',
  participant,
  takenBy: 'user-1',
  blob: new Blob([PNG_BYTES], { type: 'image/png' }),
  frameId: null as string | null,
  isReportPhoto: false,
}

function renderUploadHook() {
  return renderHook(() => useSmartPhotos('child-1', participant))
}

beforeEach(() => {
  // resetAllMocks (not clear): a mockRejectedValue/mockImplementation set in
  // one test must not leak into the next — clear keeps implementations.
  vi.resetAllMocks()
  vi.mocked(photoService.upload).mockResolvedValue(uploadedPhoto)
  vi.mocked(photoService.update).mockResolvedValue(uploadedPhoto)
  vi.mocked(photoService.setReportPhoto).mockResolvedValue(uploadedPhoto)
  vi.mocked(photoService.getByParticipant).mockResolvedValue([])
})

describe('useSmartPhotos.uploadPhoto', () => {
  it('uploads a PNG blob as photo-<ts>.png with image/png type and unchanged full size', async () => {
    const { result } = renderUploadHook()

    await act(async () => {
      await result.current.uploadPhoto({ ...baseArgs })
    })

    const uploadMock = vi.mocked(photoService.upload)
    expect(uploadMock).toHaveBeenCalledTimes(1)
    const [participantId, sessionId, file] = uploadMock.mock.calls[0]
    expect(participantId).toBe('child-1')
    expect(sessionId).toBe('sess-1')
    expect(file).toBeInstanceOf(File)
    expect(file.name).toMatch(/^photo-\d+\.png$/)
    expect(file.type).toBe('image/png')
    // Full size preserved — the blob's exact byte count goes up (no compression).
    expect(file.size).toBe(PNG_BYTES.length)
  })

  it('keeps a JPEG blob as photo-<ts>.jpg with its own MIME type', async () => {
    const jpegBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], {
      type: 'image/jpeg',
    })
    const { result } = renderUploadHook()

    await act(async () => {
      await result.current.uploadPhoto({ ...baseArgs, blob: jpegBlob })
    })

    const [, , file] = vi.mocked(photoService.upload).mock.calls[0]
    expect(file.name).toMatch(/^photo-\d+\.jpg$/)
    expect(file.type).toBe('image/jpeg')
  })

  it('forwards opts.onProgress to the service upload', async () => {
    const onProgress = vi.fn()
    vi.mocked(photoService.upload).mockImplementation(
      async (_participantId, _sessionId, _file, opts) => {
        opts?.onProgress?.(42)
        return uploadedPhoto
      },
    )
    const { result } = renderUploadHook()

    await act(async () => {
      await result.current.uploadPhoto({ ...baseArgs }, { onProgress })
    })

    // The hook handed OUR callback to the service, and a service-side progress
    // event reached it unchanged — end-to-end forwarding, not a stub echo.
    const forwarded = vi.mocked(photoService.upload).mock.calls[0][3]
    expect(forwarded).toBeDefined()
    expect(forwarded?.onProgress).toBe(onProgress)
    expect(onProgress).toHaveBeenCalledWith(42)
  })

  it('rejects with the original server error when the upload fails', async () => {
    const serverError = new ApiError('Tipe berkas tidak diizinkan', 'file_type_unsupported', 415)
    vi.mocked(photoService.upload).mockRejectedValue(serverError)
    const { result } = renderUploadHook()

    await act(async () => {
      await expect(result.current.uploadPhoto({ ...baseArgs })).rejects.toBe(serverError)
    })

    // Nothing after the failed upload ran — no swallowed/misleading state.
    expect(photoService.update).not.toHaveBeenCalled()
    expect(photoService.setReportPhoto).not.toHaveBeenCalled()
    expect(photoService.getByParticipant).not.toHaveBeenCalled()
  })

  it('calls setReportPhoto only when isReportPhoto is true', async () => {
    const { result } = renderUploadHook()

    await act(async () => {
      await result.current.uploadPhoto({ ...baseArgs, isReportPhoto: false })
    })
    expect(photoService.setReportPhoto).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.uploadPhoto({ ...baseArgs, isReportPhoto: true })
    })
    expect(photoService.setReportPhoto).toHaveBeenCalledTimes(1)
    expect(photoService.setReportPhoto).toHaveBeenCalledWith('photo-1')
  })

  it('rejects with the original error when the follow-up update fails', async () => {
    const followUpError = new ApiError('Frame tidak valid', 'validation_error', 400)
    vi.mocked(photoService.update).mockRejectedValue(followUpError)
    const { result } = renderUploadHook()

    await act(async () => {
      await expect(
        result.current.uploadPhoto({ ...baseArgs, frameId: 'frame-1' }),
      ).rejects.toBe(followUpError)
    })

    expect(photoService.setReportPhoto).not.toHaveBeenCalled()
    // The refresh is a later step — never reached once a follow-up failed.
    expect(photoService.getByParticipant).not.toHaveBeenCalled()
  })

  it('rejects with the original error when setReportPhoto fails', async () => {
    const reportError = new ApiError('Consent dicabut', 'consent_required', 403)
    vi.mocked(photoService.setReportPhoto).mockRejectedValue(reportError)
    const { result } = renderUploadHook()

    await act(async () => {
      await expect(
        result.current.uploadPhoto({ ...baseArgs, isReportPhoto: true }),
      ).rejects.toBe(reportError)
    })

    expect(photoService.getByParticipant).not.toHaveBeenCalled()
  })

  it('refreshes the photo list from the server after a fully successful upload', async () => {
    const { result } = renderUploadHook()

    await act(async () => {
      await result.current.uploadPhoto({ ...baseArgs, frameId: 'frame-1' })
    })

    expect(photoService.getByParticipant).toHaveBeenCalledTimes(1)
    expect(photoService.getByParticipant).toHaveBeenCalledWith('child-1')
  })

  it('rejects with the original error when the post-upload list refresh fails', async () => {
    const refreshError = new ApiError('Server sibuk', 'internal_error', 500)
    vi.mocked(photoService.getByParticipant).mockRejectedValue(refreshError)
    const { result } = renderUploadHook()

    await act(async () => {
      await expect(result.current.uploadPhoto({ ...baseArgs })).rejects.toBe(refreshError)
    })
  })
})

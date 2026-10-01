import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// ── Mock the multipart service BEFORE importing the unit under test ─────
vi.mock('@/core/services/upload-multipart', () => ({
  uploadMultipart: vi.fn(),
}))

import { uploadMultipart } from '@/core/services/upload-multipart'
import { uploadBadgeImage, BADGE_UPLOAD_MAX_ATTEMPTS } from '@/core/utils/badgeImage'
import { ApiError } from '@/core/services/backend-client'

// uploadMultipart is generic; widen the mock so resolved payloads can be set
// without casting at every call site.
type UploadMock = Mock<(path: string, form: FormData, options?: unknown) => Promise<unknown>>
const upload = uploadMultipart as unknown as UploadMock

const file = new File(['binary-bytes'], 'badge.png', { type: 'image/png' })
// Shared transport-failure fixture: what upload-multipart throws for XHR
// onerror (status 0). Reused wherever a retryable failure is needed.
const NETWORK_FAILURE = new ApiError('Network error during upload', 'network_error', 0)

/** Deterministic microtask drain (fake timers do not affect Promise jobs). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

async function captureFailure(promise: Promise<unknown>): Promise<unknown> {
  let caught: unknown
  try {
    await promise
  } catch (err) {
    caught = err
  }
  return caught
}

describe('uploadBadgeImage: retry + response validation (kontrak D4)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    upload.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries transport failures with 1s/2s backoff, then resolves the content id', async () => {
    upload
      .mockRejectedValueOnce(NETWORK_FAILURE)
      .mockRejectedValueOnce(new ApiError('Upload timed out', 'timeout', 0))
      .mockResolvedValueOnce({ id: 'content-9' })

    const onRetry = vi.fn()
    const promise = uploadBadgeImage(file, { onRetry })
    expect(upload).toHaveBeenCalledTimes(1)
    await flushMicrotasks()

    // Attempt 1 failed → exactly 1s of backoff before attempt 2.
    await vi.advanceTimersByTimeAsync(999)
    await flushMicrotasks()
    expect(upload).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flushMicrotasks()
    expect(upload).toHaveBeenCalledTimes(2)

    // Attempt 2 failed → 2s of backoff before attempt 3.
    await vi.advanceTimersByTimeAsync(1999)
    await flushMicrotasks()
    expect(upload).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await flushMicrotasks()
    expect(upload).toHaveBeenCalledTimes(3)

    await expect(promise).resolves.toBe('content-9')
    expect(onRetry).toHaveBeenNthCalledWith(1, 2, BADGE_UPLOAD_MAX_ATTEMPTS)
    expect(onRetry).toHaveBeenNthCalledWith(2, 3, BADGE_UPLOAD_MAX_ATTEMPTS)
  })

  it('gives up after the maximum attempts with a clear user-facing error (never silent, never success)', async () => {
    upload.mockImplementation(() => Promise.reject(NETWORK_FAILURE))

    const onRetry = vi.fn()
    const promise = captureFailure(uploadBadgeImage(file, { onRetry }))
    await flushMicrotasks()
    expect(upload).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    await flushMicrotasks()
    expect(upload).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(2000)
    await flushMicrotasks()
    expect(upload).toHaveBeenCalledTimes(BADGE_UPLOAD_MAX_ATTEMPTS)

    const caught = await promise
    expect(caught).toBeInstanceOf(ApiError)
    expect(caught).toMatchObject({ code: 'network', status: 0 })
    expect((caught as Error).message).toContain(`setelah ${BADGE_UPLOAD_MAX_ATTEMPTS} percobaan`)
    expect(onRetry).toHaveBeenCalledTimes(BADGE_UPLOAD_MAX_ATTEMPTS - 1)
    // No fourth attempt and no dangling backoff timer.
    expect(upload).toHaveBeenCalledTimes(BADGE_UPLOAD_MAX_ATTEMPTS)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never retries a 4xx — the ApiError surfaces on the first attempt', async () => {
    upload.mockRejectedValueOnce(new ApiError('Permintaan tidak dapat diproses.', 'bad_request', 400))

    const caught = await captureFailure(uploadBadgeImage(file))

    expect(caught).toBeInstanceOf(ApiError)
    expect(caught).toMatchObject({
      status: 400,
      code: 'bad_request',
      message: 'Permintaan tidak dapat diproses.',
    })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never retries a 5xx (a repeat could duplicate the Content row)', async () => {
    upload.mockRejectedValueOnce(new ApiError('Server sedang sibuk', 'internal_error', 500))

    const caught = await captureFailure(uploadBadgeImage(file))

    expect(caught).toBeInstanceOf(ApiError)
    expect(caught).toMatchObject({ status: 500, code: 'internal_error', message: 'Server sedang sibuk' })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects a resolved payload without a usable content id as a user-facing error', async () => {
    for (const payload of [undefined, {}, { id: '' }, { id: '   ' }]) {
      upload.mockResolvedValueOnce(payload)

      const caught = await captureFailure(uploadBadgeImage(file))

      expect(caught).toBeInstanceOf(ApiError)
      expect(caught).toMatchObject({ code: 'unexpected_response' })
      expect((caught as Error).message).toContain('id konten badge')
    }
    expect(upload).toHaveBeenCalledTimes(4)
    // Malformed responses are surfaced, never retried.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('an abort during the backoff cancels the retry without another attempt', async () => {
    upload.mockRejectedValueOnce(NETWORK_FAILURE)

    const controller = new AbortController()
    const promise = captureFailure(uploadBadgeImage(file, { signal: controller.signal }))
    await flushMicrotasks()
    expect(upload).toHaveBeenCalledTimes(1)

    controller.abort()
    const caught = await promise

    expect(caught).toMatchObject({ name: 'AbortError' })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})

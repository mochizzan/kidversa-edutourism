import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'
import { useToastStore } from '@/core/stores/toastStore'
import { ApiError } from '@/core/services/backend-client'
import { uploadBadgeImage, verifyBadgeMedia } from '@/core/utils/badgeImage'
import type * as BadgeImageModule from '@/core/utils/badgeImage'
import { BadgeEditor } from '@/features/admin/components/BadgeEditor'

// Mock only the two network stages; badgeFileRejection / BADGE_UPLOAD_MAX_*
// stay REAL so picks flow through the production validation path.
vi.mock('@/core/utils/badgeImage', async (importOriginal) => ({
  ...(await importOriginal<typeof BadgeImageModule>()),
  uploadBadgeImage: vi.fn(),
  verifyBadgeMedia: vi.fn(),
}))

type BadgeOptions = Parameters<typeof uploadBadgeImage>[1]

interface PendingUpload {
  promise: Promise<string>
  resolve: (id: string) => void
  reject: (err: unknown) => void
  options?: BadgeOptions
}

function makeProps() {
  return {
    title: 'Badge Topik',
    variant: 'subtopik' as const,
    name: 'Budi',
    imageUrl: '',
    helperText: 'Diberikan saat semua kegiatan dinilai.',
    onNameChange: vi.fn(),
    onImageChange: vi.fn(),
  }
}

describe('BadgeEditor: honest upload state (kontrak D4)', () => {
  let uploads: PendingUpload[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    uploads = []
    useToastStore.setState({ toasts: [] })
    vi.mocked(uploadBadgeImage).mockImplementation((_file: File, options?: BadgeOptions) => {
      const { promise, resolve, reject } = Promise.withResolvers<string>()
      const entry: PendingUpload = { promise, resolve, reject, options }
      uploads.push(entry)
      return promise
    })
    // Default: verification passes; individual tests override to control it.
    vi.mocked(verifyBadgeMedia).mockResolvedValue(undefined)
  })

  function pickFile(container: HTMLElement) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    act(() => {
      fireEvent.change(input, {
        target: { files: [new File(['x'], 'badge.png', { type: 'image/png' })] },
      })
    })
  }

  // Same lookup shape as tIfExists (core/i18n): key/options as never, result as string.
  const t = (key: string, opts?: Record<string, unknown>) =>
    i18n.t(key as never, opts as never) as unknown as string

  it('shows real transfer percent and retry attempt, and declares success only after upload AND media verification', async () => {
    const props = makeProps()
    const { container } = render(<BadgeEditor {...props} />)

    pickFile(container)
    expect(uploadBadgeImage).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: t('admin.badge.uploading') })).toBeDisabled()
    expect(props.onImageChange).not.toHaveBeenCalled()

    // Percent = XHR transfer fact, rendered verbatim.
    act(() => {
      uploads[0].options?.onProgress?.(42)
    })
    expect(
      screen.getByRole('button', { name: t('admin.badge.uploadingPercent', { percent: 42 }) }),
    ).toBeDisabled()
    expect(props.onImageChange).not.toHaveBeenCalled()

    // Honest retry state: attempt n of max.
    act(() => {
      uploads[0].options?.onRetry?.(2, 3)
    })
    expect(
      screen.getByRole('button', { name: t('admin.badge.uploadRetry', { attempt: 2, max: 3 }) }),
    ).toBeDisabled()
    expect(props.onImageChange).not.toHaveBeenCalled()

    // A resolved server response yields the id, but success is withheld until
    // verifyBadgeMedia confirms the id is actually servable.
    const verify = Promise.withResolvers<void>()
    vi.mocked(verifyBadgeMedia).mockReturnValue(verify.promise)
    await act(async () => {
      uploads[0].resolve('content-9')
    })
    expect(verifyBadgeMedia).toHaveBeenCalledWith('content-9')
    expect(props.onImageChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: t('admin.badge.uploadSuccess') })).toBeNull()
    // Still busy (verifying) → the button stays disabled.
    expect(
      screen.getByRole('button', { name: t('admin.badge.uploadRetry', { attempt: 2, max: 3 }) }),
    ).toBeDisabled()

    // Only a passing verification yields success.
    await act(async () => {
      verify.resolve()
    })
    expect(props.onImageChange).toHaveBeenCalledTimes(1)
    expect(props.onImageChange).toHaveBeenCalledWith('content-9')
    expect(screen.getByRole('button', { name: t('admin.badge.uploadSuccess') })).toBeEnabled()
  })

  it('surfaces a friendly error toast on failure and lands in an explicit error, usable state', async () => {
    const props = makeProps()
    const { container } = render(<BadgeEditor {...props} />)

    pickFile(container)
    await act(async () => {
      uploads[0].reject(
        new ApiError('Gagal terhubung ke server. Periksa koneksi internet Anda.', 'network', 0),
      )
    })

    // Never a fake success: the image callback is untouched on failure.
    expect(props.onImageChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: t('admin.badge.uploadSuccess') })).toBeNull()
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ type: 'error', message: i18n.t('errors.network') })

    // Explicit error state → the picker works again.
    expect(screen.getByRole('button', { name: t('admin.status.error') })).toBeEnabled()
    pickFile(container)
    expect(uploadBadgeImage).toHaveBeenCalledTimes(2)
  })

  it('still withholds the id when verification fails after a retried upload', async () => {
    const props = makeProps()
    const { container } = render(<BadgeEditor {...props} />)

    pickFile(container)
    // The transfer itself succeeded (after an honest retry)…
    act(() => {
      uploads[0].options?.onRetry?.(2, 3)
    })
    vi.mocked(verifyBadgeMedia).mockRejectedValueOnce(
      new ApiError('Gambar badge tidak dapat dimuat dari server (status 404).', 'unknown', 404),
    )
    await act(async () => {
      uploads[0].resolve('content-9')
    })

    expect(verifyBadgeMedia).toHaveBeenCalledTimes(1)
    // …but the media endpoint did not confirm it → no handoff, no success.
    expect(props.onImageChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: t('admin.badge.uploadSuccess') })).toBeNull()
    expect(screen.getByRole('button', { name: t('admin.status.error') })).toBeEnabled()
  })

  it('an unmount aborts the in-flight upload without a failure toast', async () => {
    const props = makeProps()
    const { container, unmount } = render(<BadgeEditor {...props} />)

    pickFile(container)
    const signal = uploads[0].options?.signal
    expect(signal?.aborted).toBe(false)

    unmount()
    expect(signal?.aborted).toBe(true)

    // The helper rejects with AbortError after the cancellation.
    await act(async () => {
      uploads[0].reject(new DOMException('Upload aborted', 'AbortError'))
    })
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})

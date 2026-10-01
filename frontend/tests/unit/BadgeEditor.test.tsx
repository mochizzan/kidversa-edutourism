import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'
import { useToastStore } from '@/core/stores/toastStore'
import { ApiError } from '@/core/services/backend-client'
import { uploadBadgeImage } from '@/core/utils/badgeImage'
import { BadgeEditor } from '@/features/admin/components/BadgeEditor'

vi.mock('@/core/utils/badgeImage', () => ({
  uploadBadgeImage: vi.fn(),
  BADGE_UPLOAD_TIMEOUT_MS: 30_000,
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

  it('shows real transfer percent and retry attempt, and declares success only after the server response', async () => {
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

    // Only a resolved server response with the id yields success.
    await act(async () => {
      uploads[0].resolve('content-9')
    })
    expect(props.onImageChange).toHaveBeenCalledWith('content-9')
    expect(screen.getByRole('button', { name: t('admin.badge.uploadSuccess') })).toBeEnabled()
  })

  it('surfaces a friendly error toast on failure and returns the button to an idle, usable state', async () => {
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
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ type: 'error', message: i18n.t('errors.network') })

    // Back to idle → the picker works again.
    expect(screen.getByRole('button', { name: t('admin.badge.uploadBtn') })).toBeEnabled()
    pickFile(container)
    expect(uploadBadgeImage).toHaveBeenCalledTimes(2)
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

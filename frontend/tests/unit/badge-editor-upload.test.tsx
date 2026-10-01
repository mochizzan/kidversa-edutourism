import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'
import { useToastStore } from '@/core/stores/toastStore'
// Real ApiError (backend-client is NOT mocked) so friendlyError's instanceof
// check behaves exactly like production.
import { ApiError } from '@/core/services/backend-client'
import type * as BadgeImageModule from '@/core/utils/badgeImage'
import { uploadBadgeImage, verifyBadgeMedia, BADGE_UPLOAD_MAX_BYTES } from '@/core/utils/badgeImage'
import { BadgeEditor } from '@/features/admin/components/BadgeEditor'

// Control both stages of the pipeline: uploadBadgeImage (storage) and
// verifyBadgeMedia (is the id actually servable?). The other exports
// (badgeFileRejection, BADGE_UPLOAD_MAX_BYTES, BADGE_UPLOAD_TIMEOUT_MS) stay
// REAL so client-side validation exercises the production code the component
// imports.
vi.mock('@/core/utils/badgeImage', async (importOriginal) => ({
  ...(await importOriginal<typeof BadgeImageModule>()),
  uploadBadgeImage: vi.fn(),
  verifyBadgeMedia: vi.fn(),
}))

interface PendingUpload {
  promise: Promise<string>
  resolve: (id: string) => void
  reject: (err: unknown) => void
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

// Same lookup shape as tIfExists (core/i18n): key/options as never, result as string.
const t = (key: string, opts?: Record<string, unknown>) =>
  i18n.t(key as never, opts as never) as unknown as string

describe('BadgeEditor: upload status handler (uji unit handler status)', () => {
  let uploads: PendingUpload[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    uploads = []
    useToastStore.setState({ toasts: [] })
    vi.mocked(uploadBadgeImage).mockImplementation(() => {
      const { promise, resolve, reject } = Promise.withResolvers<string>()
      uploads.push({ promise, resolve, reject })
      return promise
    })
    vi.mocked(verifyBadgeMedia).mockResolvedValue(undefined)
  })

  function pickFileAs(container: HTMLElement, file: File) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    act(() => {
      fireEvent.change(input, {
        target: { files: [file] },
      })
    })
  }

  function pickFile(container: HTMLElement) {
    pickFileAs(container, new File(['x'], 'badge.png', { type: 'image/png' }))
  }

  it('a. upload resolves + verify resolves → success label, onImageChange called once with the id', async () => {
    const props = makeProps()
    const { container } = render(<BadgeEditor {...props} />)
    pickFile(container)

    // Hold verification open to observe the gate between stored and verified.
    const verify = Promise.withResolvers<void>()
    vi.mocked(verifyBadgeMedia).mockReturnValue(verify.promise)
    await act(async () => {
      uploads[0].resolve('content-9')
    })
    // Upload stored, verification pending → success is impossible yet.
    expect(screen.queryByRole('button', { name: t('admin.badge.uploadSuccess') })).toBeNull()
    expect(props.onImageChange).not.toHaveBeenCalled()

    await act(async () => {
      verify.resolve()
    })
    expect(verifyBadgeMedia).toHaveBeenCalledTimes(1)
    expect(verifyBadgeMedia).toHaveBeenCalledWith('content-9')
    expect(props.onImageChange).toHaveBeenCalledTimes(1)
    expect(props.onImageChange).toHaveBeenCalledWith('content-9')
    expect(screen.getByRole('button', { name: t('admin.badge.uploadSuccess') })).toBeEnabled()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('b. upload resolves + verify rejects (404) → error UI, no success label, id never handed over', async () => {
    const props = makeProps()
    const { container } = render(<BadgeEditor {...props} />)
    pickFile(container)
    vi.mocked(verifyBadgeMedia).mockRejectedValue(
      new ApiError('Konten tidak tersedia di media server.', 'not_found', 404),
    )
    await act(async () => {
      uploads[0].resolve('content-9')
    })

    expect(verifyBadgeMedia).toHaveBeenCalledWith('content-9')
    expect(props.onImageChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: t('admin.badge.uploadSuccess') })).toBeNull()
    expect(screen.getByRole('button', { name: t('admin.status.error') })).toBeEnabled()

    // Toast explains the stored-but-unreachable state, with the real server
    // message appended via friendlyError (errors.not_found is localized).
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      type: 'error',
      message: `${t('admin.badge.mediaUnavailable')} (${t('errors.not_found')})`,
    })
  })

  it('c. upload rejects (network) → error UI, no success label, verify never runs', async () => {
    const props = makeProps()
    const { container } = render(<BadgeEditor {...props} />)
    pickFile(container)
    await act(async () => {
      uploads[0].reject(new ApiError('Network error during upload', 'network', 0))
    })

    expect(verifyBadgeMedia).not.toHaveBeenCalled()
    expect(props.onImageChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: t('admin.badge.uploadSuccess') })).toBeNull()
    expect(screen.getByRole('button', { name: t('admin.status.error') })).toBeEnabled()

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ type: 'error', message: t('errors.network') })
  })

  it('d. preview <img> error event → success label disappears, error surfaced, single toast', async () => {
    const props = makeProps()
    const { container, rerender } = render(<BadgeEditor {...props} />)
    pickFile(container)
    await act(async () => {
      uploads[0].resolve('content-9')
    })
    expect(props.onImageChange).toHaveBeenCalledWith('content-9')

    // Parent feeds the verified id back → the preview requests the media URL.
    rerender(<BadgeEditor {...props} imageUrl="content-9" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()

    // Duplicate error events for the same src must not stack extra toasts.
    act(() => {
      fireEvent.error(img as Element)
      fireEvent.error(img as Element)
    })

    expect(screen.queryByRole('button', { name: t('admin.badge.uploadSuccess') })).toBeNull()
    expect(screen.getByRole('button', { name: t('admin.status.error') })).toBeEnabled()
    // Not a silent display:none: an inline role="alert" message replaces the
    // broken preview.
    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain(t('admin.badge.mediaUnavailable'))

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      type: 'error',
      message: t('admin.badge.mediaUnavailable'),
    })
  })

  it('e. non-image file rejected BEFORE any network call: no upload, error status, clear toast', () => {
    const props = makeProps()
    const { container } = render(<BadgeEditor {...props} />)
    pickFileAs(container, new File(['%PDF-1.4'], 'badge.pdf', { type: 'application/pdf' }))

    // Nothing goes over the wire for a file the badge flow can never store.
    expect(uploadBadgeImage).not.toHaveBeenCalled()
    expect(verifyBadgeMedia).not.toHaveBeenCalled()
    expect(props.onImageChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: t('admin.status.error') })).toBeEnabled()

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ type: 'error', message: t('admin.badge.invalidType') })
  })

  it('f. SVG rejected up front (image/* but unservable): no upload, error status, clear toast', () => {
    const props = makeProps()
    const { container } = render(<BadgeEditor {...props} />)
    pickFileAs(
      container,
      new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'badge.svg', {
        type: 'image/svg+xml',
      }),
    )

    // safeContentType refuses to serve SVG, so an upload could only fail AFTER
    // the bytes hit the server — reject before any request instead.
    expect(uploadBadgeImage).not.toHaveBeenCalled()
    expect(verifyBadgeMedia).not.toHaveBeenCalled()
    expect(props.onImageChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: t('admin.status.error') })).toBeEnabled()

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ type: 'error', message: t('admin.badge.invalidType') })
  })

  it('g. file above the server cap rejected BEFORE any network call with the size message', () => {
    const props = makeProps()
    const { container } = render(<BadgeEditor {...props} />)
    const file = new File(['x'], 'huge.png', { type: 'image/png' })
    // One byte above the cap without allocating a 25 MiB buffer.
    Object.defineProperty(file, 'size', { value: BADGE_UPLOAD_MAX_BYTES + 1 })
    pickFileAs(container, file)

    expect(uploadBadgeImage).not.toHaveBeenCalled()
    expect(verifyBadgeMedia).not.toHaveBeenCalled()
    expect(props.onImageChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: t('admin.status.error') })).toBeEnabled()

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      type: 'error',
      message: t('admin.content.fileTooLarge', { limit: BADGE_UPLOAD_MAX_BYTES / (1024 * 1024) }),
    })
  })

  it('h. selection while an upload is in flight is ignored: exactly one upload stays in flight', async () => {
    const props = makeProps()
    const { container } = render(<BadgeEditor {...props} />)
    pickFile(container)
    expect(uploadBadgeImage).toHaveBeenCalledTimes(1)

    // The hidden input is NOT disabled while busy — a second change event can
    // still fire. The guard drops it (no second upload, no toast) instead of
    // racing two uploads over the same status/percent/abort state.
    pickFileAs(container, new File(['y'], 'second.png', { type: 'image/png' }))
    expect(uploadBadgeImage).toHaveBeenCalledTimes(1)
    expect(uploads).toHaveLength(1)
    expect(useToastStore.getState().toasts).toHaveLength(0)

    // The single in-flight upload still completes normally.
    await act(async () => {
      uploads[0].resolve('content-9')
    })
    expect(verifyBadgeMedia).toHaveBeenCalledTimes(1)
    expect(props.onImageChange).toHaveBeenCalledTimes(1)
    expect(props.onImageChange).toHaveBeenCalledWith('content-9')
    expect(screen.getByRole('button', { name: t('admin.badge.uploadSuccess') })).toBeEnabled()
  })

  it('i. tenant scope failure surfaces the localized tenant_required message (never empty)', async () => {
    const props = makeProps()
    const { container } = render(<BadgeEditor {...props} />)
    pickFile(container)
    await act(async () => {
      uploads[0].reject(new ApiError('Silakan pilih tenant terlebih dahulu.', 'tenant_required', 400))
    })

    expect(screen.getByRole('button', { name: t('admin.status.error') })).toBeEnabled()
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    // friendlyError resolves errors.<code> from the catalog — a real localized
    // message, never an empty string or the raw backend payload.
    expect(toasts[0]).toMatchObject({ type: 'error', message: t('errors.tenant_required') })
    expect(toasts[0].message).not.toBe('')
  })
})

// Contract #5 (wave 1): the REAL verifyBadgeMedia must reject a non-200 with
// an ApiError carrying the HTTP status and the backend {error:{code,message}}
// envelope — never resolve. The module-level mock above stands in for the
// component tests, so the production implementation is driven here via
// importActual + a scripted XHR.
describe('verifyBadgeMedia: non-200 rejects with ApiError (kontrak #5)', () => {
  const OriginalXHR = globalThis.XMLHttpRequest

  class ScriptedXHR {
    status = 0
    responseText = ''
    withCredentials = false
    timeout = 0
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    ontimeout: (() => void) | null = null
    onabort: (() => void) | null = null
    open(): void { }
    setRequestHeader(): void { }
    abort(): void { }
    send(): void {
      this.status = 404
      this.responseText = JSON.stringify({
        error: { code: 'not_found', message: 'Konten tidak tersedia di media server.' },
      })
      this.onload?.()
    }
  }

  afterEach(() => {
    globalThis.XMLHttpRequest = OriginalXHR
  })

  it('media endpoint 404 → rejects with status 404, envelope code and message (never resolves)', async () => {
    const actual = await vi.importActual<typeof BadgeImageModule>('@/core/utils/badgeImage')
    globalThis.XMLHttpRequest = ScriptedXHR as unknown as typeof XMLHttpRequest

    const err = await actual.verifyBadgeMedia('content-404').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Konten tidak tersedia di media server.',
    })
  })
})

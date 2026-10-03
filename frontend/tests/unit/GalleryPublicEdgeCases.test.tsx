import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { act, render, screen } from './test-utils'
import { i18n } from '@/core/i18n'
import { ApiError } from '@/core/services/backend-client'

// Mock the service layer only — the guard's catch/mapping and GalleryView's
// render run for real. ApiError stays the real class so `instanceof` in
// mapGalleryLoadError sees exactly what the guard would receive.
vi.mock('@/core/services/gallery', () => ({
  galleryService: {
    getByToken: vi.fn(),
    photoUrl: vi.fn(),
  },
}))

import { galleryService } from '@/core/services/gallery'
import GalleryPage from '@/features/parent/pages/GalleryPage'
import type { GalleryData, GalleryPhoto } from '@/core/types'

function makePhoto(id: string): GalleryPhoto {
  return {
    id,
    original_file_url: `/files/${id}.jpg`,
    framed_file_url: `/files/${id}-framed.jpg`,
    is_report_photo: false,
    report_photo: false,
    // Legacy-bucket row; topics: [] below → no switcher, flat grid (this
    // suite pins the guard/error behavior, not the topic switcher).
    session_stage_id: '',
    taken_at: '2026-01-01T07:00:00Z',
    taken_by: 'user-1',
  }
}

function makeGallery(photos: GalleryPhoto[]): GalleryData {
  return {
    report_id: 'rep-1',
    participant_id: 'child-1',
    session_id: 'ses-1',
    group_name: 'Kelompok A',
    child_name: 'Ananda Bela',
    photos,
    topics: [],
  }
}

function renderGallery() {
  return render(
    <MemoryRouter initialEntries={['/gallery?token=tok-abc123']}>
      <Routes>
        <Route path="/gallery" element={<GalleryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Flush the mount fetch chain (promise → setState inside the guard effect). */
async function flush() {
  await act(async () => { })
}

beforeEach(() => {
  vi.mocked(galleryService.getByToken).mockReset()
  vi.mocked(galleryService.photoUrl).mockReset()
  vi.mocked(galleryService.photoUrl).mockImplementation(
    (_token, photoId, variant) => `/mock-photo/${photoId}${variant ? `?variant=${variant}` : ''}`,
  )
})

describe('GalleryTokenGuard error mapping', () => {
  it('403 consent_required → layar menunggu persetujuan, bukan "link tidak valid"', async () => {
    vi.mocked(galleryService.getByToken).mockRejectedValue(
      new ApiError('Persetujuan orang tua diperlukan', 'consent_required', 403),
    )
    renderGallery()
    await flush()

    expect(screen.getByText('Menunggu persetujuan foto')).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('parent.gallery.invalidTitle'))).toBeNull()
    // Error screen only — the gallery body is never mounted underneath.
    expect(screen.queryByText('Ananda Bela')).toBeNull()
  })

  it('429 too_many_requests → pesan rate limit, bukan "link tidak valid"', async () => {
    vi.mocked(galleryService.getByToken).mockRejectedValue(
      new ApiError('Too many requests', 'too_many_requests', 429),
    )
    renderGallery()
    await flush()

    expect(screen.getByText('Terlalu banyak permintaan')).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('parent.gallery.invalidTitle'))).toBeNull()
  })

  it('500 internal_error → pesan gangguan server, bukan "link tidak valid"', async () => {
    vi.mocked(galleryService.getByToken).mockRejectedValue(
      new ApiError('Kesalahan server', 'internal_error', 500),
    )
    renderGallery()
    await flush()

    expect(screen.getByText('Gangguan server')).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('parent.gallery.invalidTitle'))).toBeNull()
  })

  it('network failure (ApiError status 0) → pesan server/jaringan, bukan "link tidak valid"', async () => {
    vi.mocked(galleryService.getByToken).mockRejectedValue(
      new ApiError('Failed to fetch', 'network', 0),
    )
    renderGallery()
    await flush()

    expect(screen.getByText('Gangguan server')).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('parent.gallery.invalidTitle'))).toBeNull()
  })

  it('non-ApiError rejection (TypeError fetch) → tetap menampilkan layar error, bukan blank', async () => {
    vi.mocked(galleryService.getByToken).mockRejectedValue(new TypeError('fetch failed'))
    renderGallery()
    await flush()

    expect(screen.getByText('Gangguan server')).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('parent.gallery.invalidTitle'))).toBeNull()
  })

  it('200 tanpa payload galeri → SERVER_ERROR, bukan layar kosong', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(null)
    renderGallery()
    await flush()

    expect(screen.getByText('Gangguan server')).toBeInTheDocument()
  })

  it('404 token_invalid tetap "link tidak valid" — validasi token tak berubah', async () => {
    vi.mocked(galleryService.getByToken).mockRejectedValue(
      new ApiError('token invalid', 'token_invalid', 404),
    )
    renderGallery()
    await flush()

    expect(screen.getByText(i18n.t('parent.gallery.invalidTitle'))).toBeInTheDocument()
    expect(screen.queryByText('Gangguan server')).toBeNull()
  })

  it('410 token_expired tetap layar kedaluwarsa — validasi token tak berubah', async () => {
    vi.mocked(galleryService.getByToken).mockRejectedValue(
      new ApiError('token expired', 'token_expired', 410),
    )
    renderGallery()
    await flush()

    expect(screen.getByText(i18n.t('parent.gallery.expiredTitle'))).toBeInTheDocument()
    expect(screen.queryByText('Gangguan server')).toBeNull()
  })

  it('410 token_revoked tetap layar ditutup — validasi token tak berubah', async () => {
    vi.mocked(galleryService.getByToken).mockRejectedValue(
      new ApiError('token revoked', 'token_revoked', 410),
    )
    renderGallery()
    await flush()

    expect(screen.getByText(i18n.t('parent.gallery.revokedTitle'))).toBeInTheDocument()
    expect(screen.queryByText('Gangguan server')).toBeNull()
  })

  it('400 bad_request (format token salah) tetap "link tidak valid"', async () => {
    vi.mocked(galleryService.getByToken).mockRejectedValue(
      new ApiError('bad request', 'bad_request', 400),
    )
    renderGallery()
    await flush()

    expect(screen.getByText(i18n.t('parent.gallery.invalidTitle'))).toBeInTheDocument()
    expect(screen.queryByText('Gangguan server')).toBeNull()
  })
})

describe('GalleryPage per-photo failure & empty list', () => {
  it('satu foto onError → hanya foto itu ter-placeholder, foto lain tetap dirender', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(
      makeGallery([makePhoto('photo-1'), makePhoto('photo-2')]),
    )
    const { container } = renderGallery()
    await flush()

    const gridImgs = () => Array.from(container.querySelectorAll('img'))
    expect(gridImgs()).toHaveLength(2)

    fireEvent.error(gridImgs()[0])
    await flush()

    expect(screen.getByText('Foto tidak tersedia')).toBeInTheDocument()
    const remaining = gridImgs()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].getAttribute('src')).toContain('photo-2')
  })

  it('foto terpilih gagal di overlay → placeholder overlay + grid, foto lain tetap', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(
      makeGallery([makePhoto('photo-1'), makePhoto('photo-2')]),
    )
    const { container } = renderGallery()
    await flush()

    const photoButtons = Array.from(container.querySelectorAll('button'))
    expect(photoButtons).toHaveLength(2)
    fireEvent.click(photoButtons[0])
    await flush()

    // Grid images carry ?variant=framed; the overlay serves the original.
    const overlayImg = container.querySelector('img:not([src*="variant"])')
    expect(overlayImg).not.toBeNull()

    fireEvent.error(overlayImg as HTMLImageElement)
    await flush()

    // Placeholder in the overlay AND on the grid tile; photo-2 untouched.
    expect(screen.getAllByText('Foto tidak tersedia')).toHaveLength(2)
    const remaining = Array.from(container.querySelectorAll('img'))
    expect(remaining).toHaveLength(1)
    expect(remaining[0].getAttribute('src')).toContain('photo-2')
  })

  it('daftar kosong → empty state "Belum ada foto", tanpa crash', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(makeGallery([]))
    renderGallery()
    await flush()

    expect(screen.getByText(i18n.t('parent.gallery.empty'))).toBeInTheDocument()
    expect(screen.queryByText('Foto tidak tersedia')).toBeNull()
  })
})

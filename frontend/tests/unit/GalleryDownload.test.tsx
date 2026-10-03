import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { act, render, screen } from './test-utils'

// Mock the service layer only — GalleryTokenGuard's fetch and GalleryView's
// fullscreen overlay render for real, exactly like GalleryPublicEdgeCases, so
// the download button's wiring is exercised in the actual DOM.
vi.mock('@/core/services/gallery', () => ({
  galleryService: {
    getByToken: vi.fn(),
    photoUrl: vi.fn(),
    photoDownloadUrl: vi.fn(),
  },
}))

import { galleryService } from '@/core/services/gallery'
import type * as GalleryModule from '@/core/services/gallery'
import GalleryPage from '@/features/parent/pages/GalleryPage'
import type { GalleryData, GalleryPhoto } from '@/core/types'

function makePhoto(id: string): GalleryPhoto {
  return {
    id,
    original_file_url: `/files/${id}.jpg`,
    framed_file_url: `/files/${id}-framed.jpg`,
    is_report_photo: false,
    report_photo: false,
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

/** Open the fullscreen overlay by clicking the (first) grid tile. */
async function openOverlay(container: HTMLElement) {
  const tiles = Array.from(container.querySelectorAll('button'))
  fireEvent.click(tiles[0]!)
  await flush()
}

beforeEach(() => {
  vi.mocked(galleryService.getByToken).mockReset()
  vi.mocked(galleryService.photoUrl).mockReset()
  vi.mocked(galleryService.photoUrl).mockImplementation(
    (_token, photoId, variant) => `/mock-photo/${photoId}${variant ? `?variant=${variant}` : ''}`,
  )
  vi.mocked(galleryService.photoDownloadUrl).mockReset()
  vi.mocked(galleryService.photoDownloadUrl).mockImplementation(
    (_token, photoId) => `/mock-download/${photoId}`,
  )
})

describe('GalleryPage fullscreen download button', () => {
  it('tombol unduh hadir di overlay dan terhubung ke endpoint /download dengan token galeri', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(makeGallery([makePhoto('photo-1')]))
    const { container } = renderGallery()
    await flush()

    await openOverlay(container)

    expect(galleryService.photoDownloadUrl).toHaveBeenCalledWith('tok-abc123', 'photo-1')
    const link = screen.getByRole('link', { name: 'Unduh foto' })
    expect(link).toHaveAttribute('href', '/mock-download/photo-1')
    expect(link).toHaveAttribute('download')
  })

  it('klik tombol unduh TIDAK menutup overlay preview', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(makeGallery([makePhoto('photo-1')]))
    const { container } = renderGallery()
    await flush()

    await openOverlay(container)
    fireEvent.click(screen.getByRole('link', { name: 'Unduh foto' }))
    await flush()

    // Overlay stays open: the fullscreen (non-variant) image is still mounted.
    expect(container.querySelector('img:not([src*="variant"])')).not.toBeNull()
  })

  it('foto gagal dimuat → tombol unduh disembunyikan (unduhan hanya akan 404)', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(
      makeGallery([makePhoto('photo-1'), makePhoto('photo-2')]),
    )
    const { container } = renderGallery()
    await flush()

    await openOverlay(container)
    fireEvent.error(container.querySelector('img:not([src*="variant"])') as HTMLImageElement)
    await flush()

    expect(screen.queryByRole('link', { name: 'Unduh foto' })).toBeNull()
    // Placeholder in the overlay AND on the grid tile — failure handled as usual.
    expect(screen.getAllByText('Foto tidak tersedia')).toHaveLength(2)
  })

  it('photoDownloadUrl (service ASLI) membangun URL endpoint unduh + token yang di-encode', async () => {
    const actual = await vi.importActual<typeof GalleryModule>('@/core/services/gallery')
    expect(actual.galleryService.photoDownloadUrl('tok en/abc', 'ph 1')).toBe(
      '/api/reports/gallery/photo/ph%201/download?token=tok%20en%2Fabc',
    )
  })
})

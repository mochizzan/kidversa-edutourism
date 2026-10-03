import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { act, render, screen } from './test-utils'

// Mock the service layer only — GalleryTokenGuard's fetch and GalleryView's
// render run for real, exactly like GalleryPublicEdgeCases.
vi.mock('@/core/services/gallery', () => ({
  galleryService: {
    getByToken: vi.fn(),
    photoUrl: vi.fn(),
    photoDownloadUrl: vi.fn(),
  },
}))

import { galleryService } from '@/core/services/gallery'
import GalleryPage from '@/features/parent/pages/GalleryPage'
import type { GalleryData, GalleryPhoto, GalleryTopic } from '@/core/types'

// ── Fixtures: sesi 2 topik + bucket legacy ────────────────────────────────

const TOPICS: GalleryTopic[] = [
  { session_stage_id: 'ss-1', program_stage_id: 'ps-1', name: 'Kebakaran' },
  { session_stage_id: 'ss-2', program_stage_id: 'ps-2', name: 'Gempa' },
]

function makePhoto(id: string, stage: string, over: Partial<GalleryPhoto> = {}): GalleryPhoto {
  return {
    id,
    original_file_url: `/files/${id}.jpg`,
    framed_file_url: `/files/${id}-framed.jpg`,
    is_report_photo: false,
    report_photo: false,
    session_stage_id: stage,
    taken_at: '2026-01-01T07:00:00Z',
    taken_by: 'user-1',
    ...over,
  }
}

function makeGallery(photos: GalleryPhoto[], topics: GalleryTopic[] = TOPICS): GalleryData {
  return {
    report_id: 'rep-1',
    participant_id: 'child-1',
    session_id: 'ses-1',
    group_name: 'Kelompok A',
    child_name: 'Ananda Bela',
    photos,
    topics,
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

/** Photo ids currently in the grid — the mocked photoUrl embeds the id. */
function visiblePhotoIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('img'))
    .map((img) => img.getAttribute('src') ?? '')
    .filter((src) => src.includes('/mock-photo/'))
    .map((src) => src.split('/mock-photo/')[1]!.split('?')[0]!)
}

async function clickChip(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
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

describe('GalleryPage — topic switcher per sesi', () => {
  it('renders the switcher from payload: chip per topik + Foto Lama hanya bila bucket legacy non-kosong', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(
      makeGallery([
        makePhoto('ph-1', 'ss-1'),
        makePhoto('ph-2', 'ss-2'),
        makePhoto('ph-legacy', ''),
      ]),
    )
    const { container } = renderGallery()
    await flush()

    // Chip group in sequence order, legacy chip appended because a '' row exists.
    expect(screen.getByRole('group', { name: 'Pilih topik' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kebakaran' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gempa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Foto Lama' })).toBeInTheDocument()

    // Default (no report_photo marker) = first topic → only ss-1 photos.
    expect(screen.getByRole('button', { name: 'Kebakaran' })).toHaveAttribute('aria-pressed', 'true')
    expect(visiblePhotoIds(container)).toEqual(['ph-1'])
  })

  it('switching topic filters the grid by session_stage_id (topik → bucket → legacy)', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(
      makeGallery([
        makePhoto('ph-1', 'ss-1'),
        makePhoto('ph-2', 'ss-2'),
        makePhoto('ph-legacy', ''),
      ]),
    )
    const { container } = renderGallery()
    await flush()
    expect(visiblePhotoIds(container)).toEqual(['ph-1'])

    await clickChip('Gempa')
    expect(visiblePhotoIds(container)).toEqual(['ph-2'])
    expect(screen.getByRole('button', { name: 'Gempa' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Kebakaran' })).toHaveAttribute('aria-pressed', 'false')

    await clickChip('Foto Lama')
    expect(visiblePhotoIds(container)).toEqual(['ph-legacy'])

    await clickChip('Kebakaran')
    expect(visiblePhotoIds(container)).toEqual(['ph-1'])
  })

  it('legacy chip hidden when the payload has no \'\'-bucket photos; grid stays per-topic', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(
      makeGallery([makePhoto('ph-1', 'ss-1'), makePhoto('ph-2', 'ss-2')]),
    )
    const { container } = renderGallery()
    await flush()

    expect(screen.queryByRole('button', { name: 'Foto Lama' })).toBeNull()
    // No legacy bucket to switch to — topic chips still filter correctly.
    await clickChip('Gempa')
    expect(visiblePhotoIds(container)).toEqual(['ph-2'])
  })

  it('empty topic → empty state per topik, bukan blank grid', async () => {
    // Default chip = Kebakaran (topics[0]) tapi semua foto milik Gempa.
    vi.mocked(galleryService.getByToken).mockResolvedValue(
      makeGallery([makePhoto('ph-2', 'ss-2')]),
    )
    renderGallery()
    await flush()

    expect(screen.getByText('Belum ada foto di topik ini')).toBeInTheDocument()

    await clickChip('Gempa')
    expect(screen.queryByText('Belum ada foto di topik ini')).toBeNull()
    expect(screen.getByRole('button', { name: 'Gempa' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('galeri tanpa foto sama sekali → empty state global (bukan pesan per topik)', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(makeGallery([]))
    renderGallery()
    await flush()

    expect(screen.getByText('Belum ada foto')).toBeInTheDocument()
    expect(screen.queryByText('Belum ada foto di topik ini')).toBeNull()
  })

  it('default chip = topik foto report_photo (QR dipindai dari mini-raport topik itu)', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(
      makeGallery([
        makePhoto('ph-1', 'ss-1'),
        makePhoto('ph-2', 'ss-2'),
        makePhoto('ph-report', 'ss-2', { report_photo: true }),
      ]),
    )
    const { container } = renderGallery()
    await flush()

    // Marker photo lives under Gempa → gallery opens on Gempa, not topics[0].
    expect(screen.getByRole('button', { name: 'Gempa' })).toHaveAttribute('aria-pressed', 'true')
    expect(visiblePhotoIds(container)).toEqual(['ph-2', 'ph-report'])
  })

  it('tanpa topik di payload (payload lama) → grid per-sesi tanpa switcher', async () => {
    vi.mocked(galleryService.getByToken).mockResolvedValue(
      makeGallery([makePhoto('ph-1', 'ss-1'), makePhoto('ph-legacy', '')], []),
    )
    const { container } = renderGallery()
    await flush()

    expect(screen.queryByRole('group', { name: 'Pilih topik' })).toBeNull()
    expect(visiblePhotoIds(container)).toEqual(['ph-1', 'ph-legacy'])
  })
})

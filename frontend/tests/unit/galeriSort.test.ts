import { describe, it, expect } from 'vitest'
import {
  sortPhotosForGallery,
  type GallerySortKey,
} from '@/features/fasilitator/pages/galeri/GaleriChildPage'
import type { SmartPhoto } from '@/core/types'

const photo = (id: string, overrides: Partial<SmartPhoto> = {}): SmartPhoto => ({
  id,
  participant_id: 'c-1',
  session_id: 's-1',
  original_file_url: '',
  is_report_photo: false,
  taken_by: 'u1',
  taken_at: '2026-09-30T00:00:00Z',
  ...overrides,
})

const ids = (photos: SmartPhoto[]) => photos.map((p) => p.id)

// created_at DESC server order (foto terbaru lebih dulu)
const newestFirst = [
  photo('newest', { created_at: '2026-09-30T03:00:00Z', taken_at: '2026-09-30T03:00:00Z' }),
  photo('middle', { created_at: '2026-09-30T02:00:00Z', taken_at: '2026-09-30T02:00:00Z' }),
  photo('oldest', { created_at: '2026-09-30T01:00:00Z', taken_at: '2026-09-30T01:00:00Z' }),
]

describe('sortPhotosForGallery', () => {
  it('newest orders time DESC and is the default ordering contract', () => {
    const shuffled = [newestFirst[2], newestFirst[0], newestFirst[1]]
    expect(ids(sortPhotosForGallery(shuffled, 'newest'))).toEqual(['newest', 'middle', 'oldest'])
    // Default page state ('newest') === time DESC on server order input
    expect(ids(sortPhotosForGallery(newestFirst, 'newest'))).toEqual(ids(newestFirst))
  })

  it('oldest orders time ASC', () => {
    expect(ids(sortPhotosForGallery(newestFirst, 'oldest'))).toEqual(['oldest', 'middle', 'newest'])
  })

  it('falls back to taken_at when created_at is missing', () => {
    const photos = [
      photo('a', { taken_at: '2026-09-30T05:00:00Z' }),
      photo('b', { created_at: '2026-09-30T06:00:00Z', taken_at: '2026-09-30T01:00:00Z' }),
    ]
    expect(ids(sortPhotosForGallery(photos, 'newest'))).toEqual(['b', 'a'])
    expect(ids(sortPhotosForGallery(photos, 'oldest'))).toEqual(['a', 'b'])
  })

  it('largest orders file_size DESC, smallest ASC', () => {
    const photos = [
      photo('small', { file_size: 1_000 }),
      photo('large', { file_size: 9_000 }),
      photo('medium', { file_size: 5_000 }),
    ]
    expect(ids(sortPhotosForGallery(photos, 'largest'))).toEqual(['large', 'medium', 'small'])
    expect(ids(sortPhotosForGallery(photos, 'smallest'))).toEqual(['small', 'medium', 'large'])
  })

  it('keeps null/undefined file_size rows LAST in both size directions', () => {
    const photos = [
      photo('legacy-null', { file_size: null }),
      photo('legacy-undefined'),
      photo('sized-big', { file_size: 9_000 }),
      photo('sized-small', { file_size: 1_000 }),
    ]
    const largest = ids(sortPhotosForGallery(photos, 'largest'))
    expect(largest.slice(0, 2)).toEqual(['sized-big', 'sized-small'])
    expect(largest.slice(2).sort()).toEqual(['legacy-null', 'legacy-undefined'])

    const smallest = ids(sortPhotosForGallery(photos, 'smallest'))
    expect(smallest.slice(0, 2)).toEqual(['sized-small', 'sized-big'])
    expect(smallest.slice(2).sort()).toEqual(['legacy-null', 'legacy-undefined'])
  })

  it('keeps size ties in time-DESC order (stable pre-sort by time)', () => {
    const photos = [
      photo('t1', { created_at: '2026-09-30T01:00:00Z', file_size: 5_000 }),
      photo('t3', { created_at: '2026-09-30T03:00:00Z', file_size: 5_000 }),
      photo('t2', { created_at: '2026-09-30T02:00:00Z', file_size: 5_000 }),
    ]
    expect(ids(sortPhotosForGallery(photos, 'largest'))).toEqual(['t3', 't2', 't1'])
    expect(ids(sortPhotosForGallery(photos, 'smallest'))).toEqual(['t3', 't2', 't1'])
  })

  it('does not mutate the input array for any key', () => {
    const photos = [newestFirst[2], { ...newestFirst[0], file_size: null }, newestFirst[1]]
    const snapshot = [...photos]
    for (const key of ['newest', 'oldest', 'largest', 'smallest'] as GallerySortKey[]) {
      const result = sortPhotosForGallery(photos, key)
      expect(result).not.toBe(photos)
      expect(photos).toEqual(snapshot)
    }
  })

  it('sorting an empty array is a no-op', () => {
    for (const key of ['newest', 'oldest', 'largest', 'smallest'] as GallerySortKey[]) {
      expect(sortPhotosForGallery([], key)).toEqual([])
    }
  })
})

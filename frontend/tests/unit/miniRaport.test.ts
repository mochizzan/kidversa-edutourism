import { describe, it, expect } from 'vitest'
import { generateMiniRaportHTML, type MiniRaportData } from '@/shared/templates/miniRaport'
import { resolveReportPhoto, selectMissionTitles } from '@/features/admin/hooks/useReportReview'
import type { ReportPhotoPick, SmartPhoto, MissionBank } from '@/core/types'

const PHOTO_URL = 'https://cdn.example.com/photos/momen.jpg'

function baseData(overrides: Partial<MiniRaportData> = {}): MiniRaportData {
  return {
    programName: 'KIDVERSA',
    topicName: 'Topik 1',
    childName: 'Budi',
    childAge: 7,
    sessionDate: 'Kamis, 01 Oktober 2026',
    stages: [],
    narrative: 'Budi sangat aktif hari ini.',
    missions: ['Rapikan mainan'],
    badges: [],
    facilitatorName: 'Bu Sari',
    ...overrides,
  }
}

describe('generateMiniRaportHTML — foto rapor vs placeholder', () => {
  it('photoUrl set → renders an <img> with the photo, no placeholder, badge kept', () => {
    const html = generateMiniRaportHTML(baseData({ photoUrl: PHOTO_URL }))
    expect(html).toContain('<img')
    expect(html).toContain(`src="${PHOTO_URL}"`)
    expect(html).not.toContain('PLACEHOLDER FOTO ANAK')
    expect(html).toContain('Momen Terbaik Hari Ini')
  })

  it('photoUrl set → kotak foto rasio 9:16 dan <img> object-contain tanpa crop', () => {
    const html = generateMiniRaportHTML(baseData({ photoUrl: PHOTO_URL }))
    // Kotak berbingkai yang membungkus photoBlock memakai rasio tetap 9:16.
    expect(html).toMatch(/class="[^"]*aspect-\[9\/16\][^"]*"/)
    // <img> memakai object-contain (fit, tanpa crop) — bukan object-cover.
    const img = html.match(/<img[^>]*src="https:\/\/cdn\.example\.com\/photos\/momen\.jpg"[^>]*>/)
    expect(img).not.toBeNull()
    expect(img![0]).toContain('object-contain')
    expect(img![0]).not.toContain('object-cover')
    expect(img![0]).toContain('w-full h-full')
  })

  it('photoUrl undefined → placeholder renders, badge kept', () => {
    const html = generateMiniRaportHTML(baseData())
    expect(html).toContain('PLACEHOLDER FOTO ANAK')
    expect(html).not.toContain(`src="${PHOTO_URL}"`)
    expect(html).toContain('Momen Terbaik Hari Ini')
  })
})

describe('resolveReportPhoto — resolusi foto rapor admin (pick → fallback)', () => {
  const participantId = 'p1'
  const topicA = 'stage-a'
  const topicB = 'stage-b'

  const photo = (id: string, isReportPhoto: boolean, owner = participantId): SmartPhoto => ({
    id,
    participant_id: owner,
    session_id: 's1',
    original_file_url: `photos/${id}.jpg`,
    is_report_photo: isReportPhoto,
    taken_by: 'fac-1',
    taken_at: '2026-10-01T00:00:00Z',
  })

  const pick = (programStageId: string, photoId: string): ReportPhotoPick => ({
    program_stage_id: programStageId,
    photo_id: photoId,
  })

  it('pick with a live photo wins over the is_report_photo default', () => {
    const photos = [photo('default', true), photo('picked', false)]
    const picks = [pick(topicA, 'picked')]
    expect(resolveReportPhoto(picks, photos, participantId, topicA)?.id).toBe('picked')
  })

  it('pick whose photo was deleted falls back to the is_report_photo photo', () => {
    const photos = [photo('default', true)] // pick's photo is gone
    const picks = [pick(topicA, 'deleted')]
    expect(resolveReportPhoto(picks, photos, participantId, topicA)?.id).toBe('default')
  })

  it('pick with deleted photo and no flagged default → null (photoUrl undefined)', () => {
    const photos = [photo('plain', false, 'other')]
    const picks = [pick(topicA, 'deleted')]
    expect(resolveReportPhoto(picks, photos, participantId, topicA)).toBe(null)
  })

  it('no pick for active topic, or picks not loaded → is_report_photo fallback', () => {
    const photos = [photo('default', true)]
    expect(resolveReportPhoto([pick(topicB, 'x')], photos, participantId, topicA)?.id).toBe(
      'default',
    )
    expect(resolveReportPhoto(null, photos, participantId, topicA)?.id).toBe('default')
  })

  it('nothing flagged → null (buildRaportHtml maps null to an undefined photoUrl)', () => {
    expect(resolveReportPhoto(null, [], participantId, topicA)).toBe(null)
    expect(resolveReportPhoto(null, [photo('plain', false)], participantId, null)).toBe(null)
  })
})

describe('generateMiniRaportHTML — bintang penilaian di-capped 4 slot (domain skor 0..4)', () => {
  // Persis markup slot dari starsHTML; ikon header ("fas fa-star text-xs" /
  // "text-brand-star text-xs") punya kelas ekstra sehingga tidak ikut terhitung.
  const STAR_SLOT = /<i class="fas fa-star (?:text-brand-star|text-gray-200)"><\/i>/g

  const ratingCases: Array<{ rating: number; filled: number }> = [
    { rating: 0, filled: 0 },
    { rating: 3, filled: 3 },
    { rating: 4, filled: 4 },
    { rating: 5, filled: 4 },
  ]

  for (const { rating, filled } of ratingCases) {
    it(`starRating ${rating} → 4 ikon fa-star, ${filled} terisi`, () => {
      const html = generateMiniRaportHTML(
        baseData({
          stages: [
            {
              name: 'Topik 1',
              sequenceOrder: 1,
              kegiatan: [{ name: 'Kegiatan A', starRating: rating }],
            },
          ],
        }),
      )
      const starIcons = html.match(STAR_SLOT) ?? []
      expect(starIcons.length).toBe(4)
      expect(starIcons.filter((icon: string) => icon.includes('text-brand-star')).length).toBe(
        filled,
      )
    })
  }
})

describe('generateMiniRaportHTML — kartu MISI hanya bila ada misi terpilih', () => {
  it('missions: [] → kartu MISI RUMAH BERSAMA KELUARGA tidak dirender', () => {
    const html = generateMiniRaportHTML(baseData({ missions: [] }))
    expect(html).not.toContain('MISI RUMAH BERSAMA KELUARGA')
  })

  it('missions terisi → kartu tampil, maksimal 4 judul', () => {
    const missions = ['Misi A', 'Misi B', 'Misi C', 'Misi D', 'Misi E']
    const html = generateMiniRaportHTML(baseData({ missions }))
    expect(html).toContain('MISI RUMAH BERSAMA KELUARGA')
    for (const m of missions.slice(0, 4)) {
      expect(html).toContain(`>${m}</p>`)
    }
    expect(html).not.toContain('Misi E')
  })
})

describe('selectMissionTitles — preview rapor tanpa fallback misi otomatis', () => {
  const bank = (...ids: string[]): MissionBank[] =>
    ids.map((id) => ({
      id,
      program_id: 'prog-1',
      title: `Judul ${id}`,
      is_active: true,
      created_at: '2026-10-01T00:00:00Z',
    }))

  it('assignedMissionIds kosong + bank misi tersedia → judul kosong (tanpa fallback)', () => {
    expect(selectMissionTitles([], bank('m1', 'm2'))).toEqual([])
  })

  it('hanya judul dari id terpilih yang ada di bank (assigned ∩ bank)', () => {
    expect(selectMissionTitles(['m2', 'ghost'], bank('m1', 'm2'))).toEqual(['Judul m2'])
    expect(selectMissionTitles(['ghost'], bank('m1', 'm2'))).toEqual([])
  })

  it('lebih dari 4 id terpilih → tetap di-cap 4 judul', () => {
    const titles = selectMissionTitles(
      ['m1', 'm2', 'm3', 'm4', 'm5'],
      bank('m1', 'm2', 'm3', 'm4', 'm5'),
    )
    expect(titles).toEqual(['Judul m1', 'Judul m2', 'Judul m3', 'Judul m4'])
  })
})

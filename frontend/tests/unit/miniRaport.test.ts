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
  badgeTopics: [],
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

// ── BADGE PENCAPAIAN: DUA SLOT (kontrak Fase 2 D3) ──

/** Isi satu slot badge: dari `data-badge-slot="<name>"` sampai slot final /
 *  komentar RINGKASAN berikutnya (markup section 4 selalu sebelum section 5). */
function badgeSlotContent(html: string, slot: 'topik' | 'final'): string {
 const start = html.indexOf(`data-badge-slot="${slot}">`)
 if (start === -1) return ''
 const from = html.slice(start)
 const end =
  slot === 'topik'
   ? from.indexOf('data-badge-slot="final">')
   : from.indexOf('<!-- 5. RINGKASAN')
 return end === -1 ? from : from.slice(0, end)
}

describe('generateMiniRaportHTML — section BADGE PENCAPAIAN dua slot (kiri topik, kanan final)', () => {
 it('badgeTopics + badgeFinal terisi → dua slot berdampingan, nama badge masing-masing di slotnya', () => {
  const html = generateMiniRaportHTML(
   baseData({
    badgeTopics: [{ badgeName: 'Badge Topik A' }],
    badgeFinal: { badgeName: 'Badge Final Program' },
   }),
  )
  // Struktur: DUA slot + divider pemisah antar slot.
  expect(html).toContain('data-badge-slot="topik">')
  expect(html).toContain('data-badge-slot="final">')
  expect(html).toMatch(/<div class="w-px bg-gray-200 shrink-0"><\/div>/)
  const left = badgeSlotContent(html, 'topik')
  const right = badgeSlotContent(html, 'final')
  expect(left).toContain('Badge Topik A')
  expect(left).not.toContain('Badge Final Program')
  expect(right).toContain('Badge Final Program')
  expect(right).not.toContain('Badge Topik A')
  // Empty-state tidak muncul saat salah satu slot terisi.
  expect(html).not.toContain('Belum ada badge yang diraih.')
 })

 it('badgeTopics terisi + badgeFinal undefined → slot kanan kosong tanpa error', () => {
  const html = generateMiniRaportHTML(
   baseData({ badgeTopics: [{ badgeName: 'Badge Topik A' }] }),
  )
  expect(html).toContain('data-badge-slot="topik">')
  expect(badgeSlotContent(html, 'topik')).toContain('Badge Topik A')
  expect(html).toMatch(/data-badge-slot="final">\s*<\/div>/)
  expect(html).not.toContain('Belum ada badge yang diraih.')
 })

 it('kedua slot kosong → empty-state "Belum ada badge yang diraih."', () => {
  const html = generateMiniRaportHTML(baseData({ badgeTopics: [] }))
  expect(html).toContain('Belum ada badge yang diraih.')
  expect(html).not.toContain('data-badge-slot=')
 })

 it('badgeImageUrl kosong → ikon fallback, tanpa <img> bersumber kosong', () => {
  const html = generateMiniRaportHTML(
   baseData({ badgeTopics: [{ badgeName: 'Badge Tanpa Gambar' }] }),
  )
  const left = badgeSlotContent(html, 'topik')
  expect(left).toContain('fa-award')
  expect(left).not.toContain('<img')
  expect(html).not.toContain('src=""')
 })

 it('badgeImageUrl ada → <img> memakai object-contain dan TIDAK object-cover', () => {
  const html = generateMiniRaportHTML(
   baseData({
    badgeTopics: [{ badgeName: 'Badge A', badgeImageUrl: 'https://cdn.example.com/badge-a.png' }],
    badgeFinal: { badgeName: 'Badge F', badgeImageUrl: 'https://cdn.example.com/badge-f.png' },
   }),
  )
  const imgs = html.match(/<img[^>]*badge-[af]\.png[^>]*>/g) ?? []
  expect(imgs.length).toBe(2)
  for (const img of imgs) {
   expect(img).toContain('object-contain')
   expect(img).not.toContain('object-cover')
   // Dimensi auto (bukan width+height kaku yang mendistorsi).
   expect(img).toContain('w-auto')
   expect(img).toContain('h-auto')
   expect(img).toContain('max-w-full')
  }
 })

 it('badgeName kosong → render aman tanpa crash (nama ditampilkan aman)', () => {
  const html = generateMiniRaportHTML(
   baseData({ badgeTopics: [{ badgeName: '' }], badgeFinal: { badgeName: '' } }),
  )
  expect(html).toContain('data-badge-slot="topik">')
  expect(html).toContain('data-badge-slot="final">')
  // Nama kosong dirender aman sebagai "—", bukan crash/kosong.
  expect(html).toContain('>—</span>')
  expect(html).not.toContain('Belum ada badge yang diraih.')
 })

 it('D5-2 topik tanpa badge: badgeFinal terisi + badgeTopics kosong → slot kiri kosong tanpa crash', () => {
  const html = generateMiniRaportHTML(
   baseData({ badgeTopics: [], badgeFinal: { badgeName: 'Badge Final Program' } }),
  )
  expect(html).toContain('data-badge-slot="topik">')
  expect(html).toMatch(/data-badge-slot="topik">\s*<\/div>/)
  expect(badgeSlotContent(html, 'final')).toContain('Badge Final Program')
  // Salah satu slot terisi → empty-state tidak muncul.
  expect(html).not.toContain('Belum ada badge yang diraih.')
 })

 it('D5-3 payload lama tanpa badgeTopics (undefined) → template tidak throw, empty-state aman', () => {
  // Simulasi payload DTO lama: field payload badge hilang sama sekali sehingga
  // pemanggil menyuntikkan undefined (bukan []).
  const legacy = { ...baseData(), badgeTopics: undefined } as unknown as MiniRaportData
  let html = ''
  expect(() => {
   html = generateMiniRaportHTML(legacy)
  }).not.toThrow()
  expect(html).toContain('Belum ada badge yang diraih.')
  expect(html).not.toContain('data-badge-slot=')
 })
})

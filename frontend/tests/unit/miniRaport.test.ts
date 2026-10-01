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

describe('resolveReportPhoto — resolusi foto rapor admin (pick → flag → galeri terbaru)', () => {
 const participantId = 'p1'
 const topicA = 'stage-a'
 const topicB = 'stage-b'

 const photo = (
  id: string,
  isReportPhoto: boolean,
  owner = participantId,
  over: Partial<SmartPhoto> = {},
 ): SmartPhoto => ({
  id,
  participant_id: owner,
  session_id: 's1',
  original_file_url: `photos/${id}.jpg`,
  is_report_photo: isReportPhoto,
  taken_by: 'fac-1',
  taken_at: '2026-10-01T00:00:00Z',
  ...over,
 })

 const pick = (programStageId: string, photoId: string): ReportPhotoPick => ({
  program_stage_id: programStageId,
  photo_id: photoId,
 })

 it('pick with a live photo wins over the flag AND a newer gallery photo', () => {
  const photos = [
   photo('default', true),
   photo('picked', false),
   photo('newest', false, participantId, { created_at: '2026-10-01T12:00:00Z' }),
  ]
  const picks = [pick(topicA, 'picked')]
  expect(resolveReportPhoto(picks, photos, participantId, topicA)?.id).toBe('picked')
 })

 it('pick whose photo was deleted → is_report_photo, tetap di atas galeri terbaru', () => {
  const photos = [
   photo('default', true, participantId, { created_at: '2026-10-01T00:00:00Z' }),
   photo('newest', false, participantId, { created_at: '2026-10-01T12:00:00Z' }),
  ] // pick's photo is gone
  const picks = [pick(topicA, 'deleted')]
  expect(resolveReportPhoto(picks, photos, participantId, topicA)?.id).toBe('default')
 })

 it('pick deleted, no flag, galeri hanya berisi foto peserta lain → null', () => {
  const photos = [photo('plain', false, 'other', { created_at: '2026-10-01T12:00:00Z' })]
  const picks = [pick(topicA, 'deleted')]
  expect(resolveReportPhoto(picks, photos, participantId, topicA)).toBe(null)
 })

 it('no pick for active topic, or picks not loaded → is_report_photo sebelum fallback galeri', () => {
  const photos = [
   photo('default', true, participantId, { created_at: '2026-10-01T00:00:00Z' }),
   photo('newest', false, participantId, { created_at: '2026-10-01T12:00:00Z' }),
  ]
  expect(resolveReportPhoto([pick(topicB, 'x')], photos, participantId, topicA)?.id).toBe(
   'default',
  )
  expect(resolveReportPhoto(null, photos, participantId, topicA)?.id).toBe('default')
 })

 it('tanpa foto rapor → foto galeri terbaru milik peserta dipakai (created_at DESC)', () => {
  const photos = [
   photo('older', false, participantId, { created_at: '2026-10-01T08:00:00Z' }),
   photo('newest', false, participantId, { created_at: '2026-10-01T12:00:00Z' }),
   photo('middle', false, participantId, { created_at: '2026-10-01T10:00:00Z' }),
   // Foto peserta lain justru paling baru — tidak boleh menang.
   photo('other-newest', false, 'other', { created_at: '2026-10-01T13:00:00Z' }),
  ]
  expect(resolveReportPhoto(null, photos, participantId, topicA)?.id).toBe('newest')
  // Tanpa topik aktif pun tier-3 tetap berlaku (server juga: pick → flag → galeri).
  expect(resolveReportPhoto(null, photos, participantId, null)?.id).toBe('newest')
 })

 it('created_at identik → tie-break taken_at lalu id DESC (sejajar urutan server)', () => {
  const tie = { created_at: '2026-10-01T10:00:00Z' }
  const photos = [
   photo('tie-a', false, participantId, { ...tie, taken_at: '2026-10-01T09:00:00Z' }),
   photo('tie-b', false, participantId, { ...tie, taken_at: '2026-10-01T09:30:00Z' }),
  ]
  expect(resolveReportPhoto(null, photos, participantId, topicA)?.id).toBe('tie-b')

  const same = {
   created_at: '2026-10-01T10:00:00Z',
   taken_at: '2026-10-01T09:00:00Z',
  }
  const idTie = [
   photo('aaa-tie', false, participantId, same),
   photo('zzz-tie', false, participantId, same),
  ]
  expect(resolveReportPhoto(null, idTie, participantId, topicA)?.id).toBe('zzz-tie')
 })

 it('galeri kosong → null (buildRaportHtml maps null ke photoUrl undefined → placeholder)', () => {
  expect(resolveReportPhoto(null, [], participantId, topicA)).toBe(null)
  expect(resolveReportPhoto(null, [], participantId, null)).toBe(null)
 })

 it('photos null/undefined/bukan array → TIDAK melempar, hasil null (placeholder)', () => {
  // Payload rusak dari API: harus degradasi ke placeholder, bukan TypeError.
  expect(resolveReportPhoto(null, null as unknown as SmartPhoto[], participantId, topicA)).toBe(
   null,
  )
  expect(
   resolveReportPhoto(null, undefined as unknown as SmartPhoto[], participantId, topicA),
  ).toBe(null)
  expect(resolveReportPhoto(null, {} as unknown as SmartPhoto[], participantId, topicA)).toBe(
   null,
  )
 })

 it('elemen photos null/undefined → dilewati tanpa TypeError; foto valid tetap menang', () => {
  const photos = [
   null,
   photo('valid', false, participantId, { created_at: '2026-10-01T12:00:00Z' }),
   undefined,
  ] as unknown as SmartPhoto[]
  expect(resolveReportPhoto(null, photos, participantId, topicA)?.id).toBe('valid')
 })

 it('created_at bukan string (angka/null) atau tidak terparse → diperlakukan paling tua', () => {
  const photos = [
   photo('bad-string', false, participantId, { created_at: 'not-a-date' }),
   photo('number-ts', false, participantId, { created_at: 1790000000000 as unknown as string }),
   photo('null-ts', false, participantId, { created_at: null as unknown as string }),
   photo('valid-newest', false, participantId, { created_at: '2026-10-01T12:00:00Z' }),
  ]
  // Semua invalid kalah dari satu created_at valid yang sah — tanpa throw.
  expect(resolveReportPhoto(null, photos, participantId, topicA)?.id).toBe('valid-newest')

  // Bahkan created_at valid TUA menang atas yang invalid (invalid = paling tua).
  const oldVsInvalid = [
   photo('invalid', false, participantId, { created_at: 'garbage', taken_at: '2099-01-01T00:00:00Z' }),
   photo('valid-2020', false, participantId, { created_at: '2020-01-01T00:00:00Z' }),
  ]
  expect(resolveReportPhoto(null, oldVsInvalid, participantId, topicA)?.id).toBe('valid-2020')
 })

 it('dua created_at sama-sama invalid → tie-break taken_at lalu id DESC (sejajar server)', () => {
  const photos = [
   photo('inv-old-taken', false, participantId, {
    created_at: 'garbage',
    taken_at: '2026-10-01T08:00:00Z',
   }),
   photo('inv-new-taken', false, participantId, {
    created_at: null as unknown as string,
    taken_at: '2026-10-01T09:00:00Z',
   }),
  ]
  expect(resolveReportPhoto(null, photos, participantId, topicA)?.id).toBe('inv-new-taken')

  const same = { created_at: 'garbage', taken_at: '2026-10-01T09:00:00Z' }
  const idTie = [
   photo('aaa-inv', false, participantId, same),
   photo('zzz-inv', false, participantId, same),
  ]
  expect(resolveReportPhoto(null, idTie, participantId, topicA)?.id).toBe('zzz-inv')
 })

 it('picks bukan array (payload rusak) → fallback tingkat 2/3 tetap, tanpa throw', () => {
  const photos = [photo('default', true, participantId, { created_at: '2026-10-01T00:00:00Z' })]
  expect(
   resolveReportPhoto({} as unknown as ReportPhotoPick[], photos, participantId, topicA)?.id,
  ).toBe('default')
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

describe('generateMiniRaportHTML — kartu MISI selalu dirender (null handling)', () => {
 it('missions: [] → kartu MISI RUMAH BERSAMA KELUARGA tetap dirender + empty state', () => {
  const html = generateMiniRaportHTML(baseData({ missions: [] }))
  expect(html).toContain('MISI RUMAH BERSAMA KELUARGA')
  expect(html).toContain('Tidak ada misi dirumah')
 })

 it('missions terisi → kartu tampil dengan judul misi, tanpa teks null-handling', () => {
  const missions = ['Misi A', 'Misi B', 'Misi C', 'Misi D', 'Misi E']
  const html = generateMiniRaportHTML(baseData({ missions }))
  expect(html).toContain('MISI RUMAH BERSAMA KELUARGA')
  expect(html).not.toContain('Tidak ada misi dirumah')
  for (const m of missions.slice(0, 4)) {
   expect(html).toContain(`>${m}</p>`)
  }
  expect(html).not.toContain('Misi E')
 })

 it('missions null → tidak throw; kartu + teks null-handling tetap dirender', () => {
  let html = ''
  expect(() => {
   html = generateMiniRaportHTML(baseData({ missions: null }))
  }).not.toThrow()
  expect(html).toContain('MISI RUMAH BERSAMA KELUARGA')
  expect(html).toContain('Tidak ada misi dirumah')
 })

 it('missions undefined (payload lama tanpa field) → tidak throw; kartu + teks null-handling tetap dirender', () => {
  const legacy = { ...baseData(), missions: undefined } as unknown as MiniRaportData
  let html = ''
  expect(() => {
   html = generateMiniRaportHTML(legacy)
  }).not.toThrow()
  expect(html).toContain('MISI RUMAH BERSAMA KELUARGA')
  expect(html).toContain('Tidak ada misi dirumah')
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
 it('badgeTopics[0] + badgeFinal → dua slot berdampingan: hanya <img> per slot (nama di alt saja), tanpa divider', () => {
  const html = generateMiniRaportHTML(
   baseData({
    badgeTopics: [{ badgeName: 'Badge Topik A', badgeImageUrl: 'https://cdn.example.com/badge-topik-a.png' }],
    badgeFinal: { badgeName: 'Badge Final Program', badgeImageUrl: 'https://cdn.example.com/badge-final.png' },
   }),
  )
  // Struktur: DUA slot tetap sebagai anchor struktural — TANPA divider pemisah.
  expect(html).toContain('data-badge-slot="topik">')
  expect(html).toContain('data-badge-slot="final">')
  expect(html).not.toMatch(/w-px bg-gray-200/)
  // Slot terisi mengisi SETENGAH lebar (flex-1) dan grup ter-stretch penuh;
  // inline min-height:0 mencegah auto-minimum flex membengkakkan kartu.
  expect(html).toContain('<div class="flex-1 min-w-0" data-badge-slot="topik">')
  expect(html).toContain('<div class="flex-1 min-w-0" data-badge-slot="final">')
  expect(html).toContain('class="flex items-stretch gap-3 justify-center" style="min-height:0"')
  const left = badgeSlotContent(html, 'topik')
  const right = badgeSlotContent(html, 'final')
  // Nama badge hanya muncul sebagai alt <img> — bukan <span> nama terlihat.
  expect(left).toContain('alt="Badge Topik A"')
  expect(left).not.toContain('Badge Final Program')
  expect(right).toContain('alt="Badge Final Program"')
  expect(right).not.toContain('Badge Topik A')
  // Isi section = hanya <img>: tanpa ikon <i> dan tanpa span nama di dalam slot.
  expect(left).not.toContain('<i')
  expect(left).not.toContain('<span')
  expect(right).not.toContain('<i')
  expect(right).not.toContain('<span')
  // Empty-state tidak muncul saat ada gambar.
  expect(html).not.toContain('Belum ada badge yang diraih.')
 })

 it('badgeTopics terisi + badgeFinal undefined → slot kanan kosong tanpa error', () => {
  const html = generateMiniRaportHTML(
   baseData({
    badgeTopics: [
     { badgeName: 'Badge Topik A', badgeImageUrl: 'https://cdn.example.com/badge-topik-a.png' },
    ],
   }),
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

 it('badgeImageUrl kosong → tanpa <img> dan tanpa ikon fallback: empty-state byte-identical', () => {
  const html = generateMiniRaportHTML(
   baseData({ badgeTopics: [{ badgeName: 'Badge Tanpa Gambar' }] }),
  )
  // Tidak ada gambar → empty-state default; elemen, kelas, dan teks persis
  // seperti format lama (tanpa slot, tanpa ikon).
  expect(html).toContain('<p class="text-[12px] text-gray-500 italic">Belum ada badge yang diraih.</p>')
  expect(html).not.toContain('data-badge-slot=')
  expect(html).not.toContain('src=""')
  // Ikon fallback <i> lama (fa-award text-xl) hilang dari isi section;
  // pill header memakai fa-award text-xs dan tidak disentuh perbaikan ini.
  expect(html).not.toContain('fa-award text-xl')
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
   // Kotak <img> mengisi slot (fill): block + w-full h-full, object-contain
   // yang me-letterbox aspek gambar — bukan dimensi auto.
   expect(img).toContain('block')
   expect(img).toContain('w-full')
   expect(img).toContain('h-full')
   // Cap maksimum dilarang: gambar harus memenuhi section, bukan thumbnail.
   expect(img).not.toContain('max-h-10')
   expect(img).not.toContain('w-auto')
  }
 })

 it('banyak badge topik + final → HANYA 2 gambar tampil (badgeTopics[0] + badgeFinal), sisanya gugur', () => {
  const html = generateMiniRaportHTML(
   baseData({
    badgeTopics: [
     { badgeName: 'Topik 1', badgeImageUrl: 'https://cdn.example.com/badge-t1.png' },
     { badgeName: 'Topik 2', badgeImageUrl: 'https://cdn.example.com/badge-t2.png' },
     { badgeName: 'Topik 3', badgeImageUrl: 'https://cdn.example.com/badge-t3.png' },
     { badgeName: 'Topik 4', badgeImageUrl: 'https://cdn.example.com/badge-t4.png' },
    ],
    badgeFinal: { badgeName: 'Final', badgeImageUrl: 'https://cdn.example.com/badge-fin.png' },
   }),
  )
  const badgeImgs = html.match(/<img[^>]*src="[^"]*badge-[^"]*"/g) ?? []
  expect(badgeImgs.length).toBe(2)
  expect(badgeImgs[0]).toContain('badge-t1.png')
  expect(badgeImgs[1]).toContain('badge-fin.png')
  expect(html).not.toContain('badge-t2.png')
  expect(html).not.toContain('badge-t4.png')
 })

 it('badgeName kosong → render aman tanpa crash (nama hanya di alt yang kosong)', () => {
  const html = generateMiniRaportHTML(
   baseData({
    badgeTopics: [{ badgeName: '', badgeImageUrl: 'https://cdn.example.com/badge-a.png' }],
    badgeFinal: { badgeName: '', badgeImageUrl: 'https://cdn.example.com/badge-f.png' },
   }),
  )
  expect(html).toContain('data-badge-slot="topik">')
  expect(html).toContain('data-badge-slot="final">')
  // Nama kosong → alt="" tanpa crash; nama TIDAK dirender sebagai teks "—"
  // yang terlihat lagi (span nama sudah dihapus dari section).
  expect(html).toContain('alt=""')
  expect(badgeSlotContent(html, 'topik')).not.toContain('—')
  expect(badgeSlotContent(html, 'final')).not.toContain('—')
  expect(html).not.toContain('Belum ada badge yang diraih.')
 })

 it('D5-2 topik tanpa badge: badgeFinal terisi + badgeTopics kosong → slot kiri kosong tanpa crash', () => {
  const html = generateMiniRaportHTML(
   baseData({
    badgeTopics: [],
    badgeFinal: {
     badgeName: 'Badge Final Program',
     badgeImageUrl: 'https://cdn.example.com/badge-final.png',
    },
   }),
  )
  expect(html).toContain('data-badge-slot="topik">')
  // Slot topik kosong tetap BARE (tanpa class) — regex ini mengunci kontrak:
  expect(html).toMatch(/data-badge-slot="topik">\s*<\/div>/)
  expect(badgeSlotContent(html, 'final')).toContain('Badge Final Program')
  // Slot terisi mengisi LEBAR PENUH pada kasus 1 badge (flex-1), slot kosong
  // tetap bare agar tidak menggeser gambar.
  expect(html).toContain('<div class="flex-1 min-w-0" data-badge-slot="final">')
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

// ── Posisi section: BADGE pindah ke kolom kiri (di bawah Momen), LEVEL memanjang ──

describe('generateMiniRaportHTML — urutan section: BADGE setelah Momen, sebelum RINGKASAN', () => {
 it('BADGE PENCAPAIAN muncul SETELAH Momen Terbaik dan SEBELUM RINGKASAN; LEVEL KEGIATAN tetap render', () => {
  const html = generateMiniRaportHTML(
   baseData({
    badgeTopics: [{ badgeName: 'Badge Topik A' }],
    badgeFinal: { badgeName: 'Badge Final Program' },
    stages: [
     { name: 'Topik 1', sequenceOrder: 1, kegiatan: [{ name: 'Kegiatan A', starRating: 3 }] },
    ],
   }),
  )
  const momen = html.indexOf('<!-- 1. MOMEN TERBAIK HARI INI')
  const badge = html.indexOf('<!-- 4. BADGE PENCAPAIAN')
  const ringkasan = html.indexOf('<!-- 5. RINGKASAN')
  expect(momen).toBeGreaterThan(-1)
  expect(badge).toBeGreaterThan(momen)
  expect(ringkasan).toBeGreaterThan(badge)

  // LEVEL KEGIATAN tetap dirender.
  expect(html).toContain('LEVEL KEGIATAN')

  // Tinggi (auto-placement grid 12 kolom): LEVEL memakai row-span-3 sehingga
  // memanjang mengisi baris-baris kolom kanan yang ditinggalkan BADGE;
  // BADGE memakai col-span-4 sehingga jatuh ke baris 4 kolom kiri (di bawah foto).
  expect(html).toContain('class="col-span-8 row-span-3 ')
  expect(html).toContain('class="col-span-4 bg-white border-2 border-brand-badge')
  // Kartu BADGE: padding seragam p-3 (12px) di KEEMPAT sisi (tanpa pt-5) dan
  // flex-col sehingga grup gambar (flex-1) mengisi tinggi konten penuh:
  // 100px (min-h) − 4px border − 24px padding = 72px untuk 1 maupun 2 badge.
  expect(html).toContain('rounded-[1.25rem] p-3 flex flex-col shadow-sm relative min-h-[100px] mt-2')
  expect(html).not.toContain('p-3 pt-5')
 })

 it('label pill BADGE punya hook id + whitespace-nowrap (kontrak __fitBadgeLabel: satu baris)', () => {
  const html = generateMiniRaportHTML(baseData())
  // Hook id dipakai skrip inline __fitBadgeLabel; nowrap menjamin pengukuran
  // natural satu baris. Teks label harus utuh (tanpa truncation/overflow-hidden).
  expect(html).toMatch(/id="badge-achievement-label" class="[^"]*whitespace-nowrap/)
  expect(html).toContain('</i> BADGE PENCAPAIAN')
  // Offset vertikal pill memakai inline top:-20px (utilitas -top-5 tidak ada
  // di CSS hasil build): tinggi pill 32px (teks 16px × line-height 1.5 +
  // py-1 4+4) sehingga tepi bawahnya tepat berhenti di batas area isi kartu
  // (border 2px + padding 12px = 14px dari tepi luar) — tanpa menimpa piksel
  // gambar; __fitBadgeLabel hanya membaca offsetLeft (left-5) — tidak berubah.
  expect(html).toContain('whitespace-nowrap" style="top:-20px"')
 })

 it('grid BADGE/LEVEL tidak merusak section MISI: Momen < BADGE < RINGKASAN < MISI < PENGESAHAN', () => {
  const html = generateMiniRaportHTML(
   baseData({
    missions: null,
    badgeTopics: [{ badgeName: 'Badge Topik A' }],
    stages: [
     { name: 'Topik 1', sequenceOrder: 1, kegiatan: [{ name: 'Kegiatan A', starRating: 3 }] },
    ],
   }),
  )
  const marks = [
   '<!-- 1. MOMEN TERBAIK',
   '<!-- 4. BADGE PENCAPAIAN',
   '<!-- 5. RINGKASAN',
   'MISI RUMAH BERSAMA KELUARGA',
   'PENGESAHAN',
  ].map((m) => html.indexOf(m))
  for (const idx of marks) expect(idx).toBeGreaterThan(-1)
  // Urutan naik tanpa bagian yang tertimpa/terpotong oleh layout baru.
  expect([...marks].sort((a, b) => a - b)).toEqual(marks)
  // Kartu MISI tetap berada di dalam grid (col-span-6) dan menampilkan
  // empty-state meski missions null pada payload yang sama.
  expect(html).toMatch(/class="col-span-6 bg-brand-yellow[^"]*"/)
  expect(html).toContain('Tidak ada misi dirumah')
 })
})

import { describe, it, expect } from 'vitest'
import {
 computeLevelKegiatanScale,
 computeLevelStageGrowWeight,
 generateMiniRaportHTML,
 type MiniRaportData,
} from '@/shared/templates/miniRaport'

// ── computeLevelKegiatanScale: skala terbesar agar tabel LEVEL KEGIATAN
//    MUAT sekaligus MENGISI kartu row-span-3 ──
// Rumus: scale = min(availableWidth / contentWidth, availableHeight / contentHeight)
// Prioritas: tumbuh mengisi kartu (termasuk area putih bawah dengan 5 kegiatan);
// turun HANYA saat konten melebihi kotak (clamp geometri, bukan cap arbitrer).
// Ukuran realistis: kartu col-span-8 inner ≈ 438×362; tabel 5 kegiatan
// (1 stage: header + 5 baris) alami ≈ 300×168.

describe('computeLevelKegiatanScale — prioritas skala besar (mengisi kartu, kasus 5 kegiatan)', () => {
 it('5 kegiatan: skala tumbuh > 1 (lebar membatasi) dan konten muat di tinggi layout pembagi', () => {
  const naturalW = 300
  const naturalH = 168
  const availW = 438
  const availH = 362
  const s = computeLevelKegiatanScale(naturalW, naturalH, availW, availH)
  expect(s).toBe(availW / naturalW) // 1.46 — skala TERBESAR yang masih muat
  expect(s).toBeGreaterThan(1) // nama/bintang/pill LEVEL membesar
  // Geometric clamp: kedua sumbu hasil skala ≤ kotak kartu.
  expect(naturalW * s).toBeLessThanOrEqual(availW)
  expect(naturalH * s).toBeLessThanOrEqual(availH)
  // Skala TIDAK boleh lebih besar sedikit pun: +0.01 sudah meluap lebar kartu
  // (alasan tunggal reduction — overflow — tidak ada di sini).
  expect(naturalW * (s + 0.01)).toBeGreaterThan(availW)
  // Skala saja menyisakan ruang tinggi (168×1.46 ≈ 245 < 362); tinggi layout
  // availH/s menampung konten alami (naturalH ≤ availH/s) sehingga bobot
  // flex-grow baris dapat membagi sisa ruang → area putih bawah TERPAKAI.
  expect(naturalH).toBeLessThanOrEqual(availH / s)
  expect(naturalH * s).toBeLessThan(availH) // ruang yang dibagikan ke baris
 })

 it('tinggi lebih ketat dari lebar → skala dibatasi tinggi, tinggi visual pas penuh', () => {
  const s = computeLevelKegiatanScale(100, 300, 400, 450)
  expect(s).toBe(1.5) // 450/300; lebar mengizinkan 4×
  expect(300 * s).toBe(450) // isi kartu tinggi-penuh (tanpa putih bawah)
  expect(100 * s).toBeLessThanOrEqual(400)
 })

 it('konten sangat kecil dari kotak → skala besar tanpa cap arbitrer (mengisi, bukan di-kecilkan)', () => {
  expect(computeLevelKegiatanScale(50, 40, 400, 400)).toBe(8) // lebar membatasi
  expect(computeLevelKegiatanScale(50, 50, 400, 200)).toBe(4) // tinggi membatasi
 })
})

describe('computeLevelKegiatanScale — clamp tumpang tindih (skala turun hanya saat overflow)', () => {
 it('konten melebihi tinggi kartu (banyak kegiatan) → turun ke rasio tinggi, tidak meluap', () => {
  // 16 kegiatan + 4 header ≈ 580px tinggi > 362 → 0.624…; skala lebih besar
  // akan menumpuk melewati tepi bawah kartu.
  const s = computeLevelKegiatanScale(300, 580, 438, 362)
  expect(s).toBe(362 / 580)
  expect(s).toBeLessThan(1)
  expect(580 * s).toBeLessThanOrEqual(362)
  expect(580 * (s + 0.01)).toBeGreaterThan(362) // lebih besar → overlap nyata
  expect(300 * s).toBeLessThanOrEqual(438)
 })

 it('konten melebihi lebar kartu (nama sangat panjang) → turun ke rasio lebar', () => {
  const s = computeLevelKegiatanScale(600, 168, 438, 362)
  expect(s).toBe(438 / 600)
  expect(s).toBeLessThan(1)
  expect(600 * s).toBeLessThanOrEqual(438)
  expect(600 * (s + 0.01)).toBeGreaterThan(438)
 })

 it('melebihi kedua sumbu → min keduua rasio (kedua clamp aktif)', () => {
  const s = computeLevelKegiatanScale(900, 700, 438, 362)
  expect(s).toBe(Math.min(438 / 900, 362 / 700))
  expect(900 * s).toBeLessThanOrEqual(438)
  expect(700 * s).toBeLessThanOrEqual(362)
 })

 it('konten MUAT di kedua sumbu → tidak pernah diturunkan di bawah 1', () => {
  expect(computeLevelKegiatanScale(300, 168, 438, 362)).toBeGreaterThan(1)
  expect(computeLevelKegiatanScale(438, 362, 438, 362)).toBe(1)
  expect(computeLevelKegiatanScale(400, 300, 438, 362)).toBeGreaterThan(1)
 })
})

describe('computeLevelKegiatanScale — batas & kasus kecil', () => {
 it('konten sama persis dengan kartu → tepat 1 (tanpa perbesaran/perkecilan)', () => {
  expect(computeLevelKegiatanScale(438, 362, 438, 362)).toBe(1)
 })

 it('satu sumbu pas, sumbu lain lebih longgar → tetap 1 (bukan > 1)', () => {
  expect(computeLevelKegiatanScale(438, 100, 438, 362)).toBe(1)
  expect(computeLevelKegiatanScale(100, 362, 438, 362)).toBe(1)
 })

 it('dimensi tidak valid (0 / negatif / NaN) → 1 (no-op aman untuk runtime)', () => {
  expect(computeLevelKegiatanScale(0, 168, 438, 362)).toBe(1)
  expect(computeLevelKegiatanScale(300, 168, -5, 362)).toBe(1)
  expect(computeLevelKegiatanScale(NaN, 168, 438, 362)).toBe(1)
  expect(computeLevelKegiatanScale(300, 168, 438, 0)).toBe(1)
  expect(computeLevelKegiatanScale(300, 168, 438, -1)).toBe(1)
 })
})

// ── computeLevelStageGrowWeight: distribusi tinggi kartu per jumlah baris ──

describe('computeLevelStageGrowWeight — bobot flex-grow = jumlah baris visual', () => {
 it('kegiatan → header + satu bobot per baris kegiatan', () => {
  expect(computeLevelStageGrowWeight(5)).toBe(6) // header + 5 baris (kasus 5 kegiatan)
  expect(computeLevelStageGrowWeight(1)).toBe(2)
  expect(computeLevelStageGrowWeight(4)).toBe(5)
 })

 it('tanpa kegiatan (empty state) → bobot 1 (satu blok, tanpa header)', () => {
  expect(computeLevelStageGrowWeight(0)).toBe(1)
 })
})

// ── Wiring runtime: markup hook + skrip __fitLevelKegiatan di semua pemicu refit ──

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

/** Irisan markup LEVEL KEGIATAN: dari komentar section ke komentar BADGE. */
function levelSection(html: string): string {
 const from = html.indexOf('<!-- 3. LEVEL KEGIATAN')
 const to = html.indexOf('<!-- 4. BADGE')
 expect(from).toBeGreaterThan(-1)
 expect(to).toBeGreaterThan(from)
 return html.slice(from, to)
}

describe('generateMiniRaportHTML — wiring __fitLevelKegiatan (runtime fitter)', () => {
 const html = generateMiniRaportHTML(
  baseData({
   stages: [
    {
     name: 'Topik 1',
     sequenceOrder: 1,
     kegiatan: [
      { name: 'Kegiatan A', starRating: 3 },
      { name: 'Kegiatan B', starRating: 2 },
      { name: 'Kegiatan C', starRating: 4 },
      { name: 'Kegiatan D', starRating: 1 },
      { name: 'Kegiatan E', starRating: 0 },
     ],
    },
   ],
  }),
 )

 it('kartu & tabel punya hook id; tabel max-content (inline style, tanpa kelas baru)', () => {
  const section = levelSection(html)
  expect(section).toContain('id="level-kegiatan-card"')
  expect(section).toContain('id="level-kegiatan-rows"')
  expect(section).toContain('style="width:max-content"')
  // Kontrak geometri kartu TIDAK berubah: col-span-8 row-span-3 p-5 pt-6 mt-2.
  expect(section).toContain('class="col-span-8 row-span-3 bg-white border-2 border-gray-200 rounded-[1.5rem] p-5 pt-6 relative mt-2"')
 })

 it('5 kegiatan: bobot flex-grow blok = 6 (header + 5 baris); tiap baris grow:1', () => {
  const section = levelSection(html)
  expect(section).toContain('style="display:flex;flex-direction:column;flex-grow:6;flex-shrink:0"')
  // header KEGIATAN/BINTANG/LEVEL + 5 baris kegiatan, masing-masing grow:1
  // (inner col memakai style="flex-grow:1" yang berbeda — tidak ikut terhitung).
  expect((section.match(/style="flex-grow:1;flex-shrink:0"/g) ?? []).length).toBe(6)
  // 5 pill LEVEL tetap utuh ter-render.
  expect((section.match(/bg-brand-lightPurple/g) ?? []).length).toBe(5)
 })

 it('rumus computeLevelKegiatanScale disuntikkan & dipakai ukuran terukur (kartu − padding)', () => {
  expect(html).toContain('var __computeLevelKegiatanScale = ')
  expect(html).toContain(
   '__computeLevelKegiatanScale(naturalW, naturalH, availW, availH)',
  )
  expect(html).toContain('function __fitLevelKegiatan()')
  // Tinggi layout pengisi = availH/scale (s ≥ 1) — kunci distribusi ke baris.
  expect(html).toContain("rows.style.height = s >= 1 && availH > 0 ? (availH / s) + 'px' : ''")
 })

 it('dipanggil di SEMUA pemicu refit yang dipakai __fitRaport/__fitBadgeLabel/__fitProfilAnak', () => {
  // __scheduleFit (fonts.ready + ResizeObserver + MutationObserver):
  expect(html).toContain('__fitProfilAnak(); __fitLevelKegiatan()')
  // __initFit: urut setelah __fitRaport & __fitProfilAnak:
  expect(html).toMatch(
   /function __initFit\(\) \{\s+__fitRaport\(\)\s+__fitProfilAnak\(\)\s+__fitLevelKegiatan\(\)/,
  )
  // beforeprint:
  expect(html).toContain("window.addEventListener('beforeprint', __fitLevelKegiatan)")
  // wiring PROFIL ANAK saudara tidak rusak oleh penambahan baris:
  expect(html).toContain('__fitRaport(); __fitBadgeLabel(); __fitProfilAnak()')
  expect(html).toContain("window.addEventListener('beforeprint', __fitProfilAnak)")
 })
})

// ── Smoke runtime: skrip inline terkompilasi & __fitLevelKegiatan bekerja di DOM ──

describe('__fitLevelKegiatan — smoke runtime (jsdom, geometri di-stub)', () => {
 /** Blok <script> inline di <head>: dari fungsi pertama sampai </script> pertama. */
 function inlineFitScript(doc: string): string {
  const start = doc.indexOf('function __scaleRingkasan')
  const end = doc.indexOf('</script>', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return doc.slice(start, end)
 }

 it('kasus tumbuh (5 kegiatan): scale > 1 + tinggi layout availH/s membagi ruang ke baris', () => {
  const script = inlineFitScript(generateMiniRaportHTML(baseData()))
  // new Function = syntax check seluruh blok skrip (termasuk injeksi .toString()).
  const api = new Function(`${script}\nreturn { fit: __fitLevelKegiatan }`)() as {
   fit: () => void
  }

  const card = document.createElement('div')
  card.id = 'level-kegiatan-card'
  card.style.padding = '24px 20px 20px' // pt-6 + p-5
  const rows = document.createElement('div')
  rows.id = 'level-kegiatan-rows'
  rows.style.marginTop = '4px' // mt-1
  document.body.append(card, rows)
  try {
   // jsdom tanpa layout → stub hasil ukuran: tabel 5 kegiatan 300×168, kartu 477×400.
   Object.defineProperty(card, 'clientWidth', { value: 477, configurable: true })
   Object.defineProperty(card, 'clientHeight', { value: 400, configurable: true })
   Object.defineProperty(rows, 'offsetWidth', { value: 300, configurable: true })
   Object.defineProperty(rows, 'offsetHeight', { value: 168, configurable: true })

   api.fit()
   // content-box = 477−40 = 437 lebar × 400−44−4(margin) = 352 tinggi.
   const availW = 437
   const availH = 352
   const grow = computeLevelKegiatanScale(300, 168, availW, availH)
   expect(grow).toBeGreaterThan(1) // prioritas: tumbuh mengisi kartu
   expect(rows.style.transformOrigin).toBe('top left')
   expect(rows.style.transform).toBe(`scale(${grow})`)
   // epsilon: batas clamp persis (300 × 437/300) kena pembulatan float IEEE-754.
   expect(300 * grow).toBeLessThanOrEqual(availW + 1e-9)
   expect(168 * grow).toBeLessThanOrEqual(availH + 1e-9)
   // Tinggi layout = availH/s → tinggi visual (× s) PAS mengisi kartu; dan
   // layout tidak pernah melampaui kartu (≥ 1 ⇒ availH/s ≤ availH < clientH).
   const layoutH = parseFloat(rows.style.height)
   expect(layoutH).toBeCloseTo(availH / grow, 5)
   expect(layoutH * grow).toBeCloseTo(availH, 5)
   expect(layoutH).toBeLessThanOrEqual(card.clientHeight)
   // Idempoten: hitung ulang hasilnya sama.
   api.fit()
   expect(parseFloat(rows.style.height)).toBeCloseTo(availH / grow, 5)
   expect(rows.style.transform).toBe(`scale(${grow})`)

   // Clamp tumpang tindih: konten lebih lebar dari kartu → skala turun < 1
   // DAN tinggi layout dikembalikan (konten alami, tanpa distribusi paksa).
   Object.defineProperty(rows, 'offsetWidth', { value: 600, configurable: true })
   api.fit()
   const clamp = computeLevelKegiatanScale(600, 168, availW, availH)
   expect(clamp).toBeLessThan(1)
   expect(rows.style.height).toBe('')
   expect(rows.style.transform).toBe(`scale(${clamp})`)
   expect(600 * clamp).toBeLessThanOrEqual(availW + 1e-9)
  } finally {
   card.remove()
   rows.remove()
  }
 })
})

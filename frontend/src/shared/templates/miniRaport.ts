import MINI_RAPORT_TAILWIND_CSS from './miniRaport.styles.css?inline'
import { RATING_ABBREVIATIONS } from '../../core/constants/assessment'

export interface MiniRaportData {
 programName: string
 topicName: string
 childName: string
 childAge: number
 childSchool?: string
 childGroup?: string
 sessionDate: string
 photoUrl?: string
 stages: {
  name: string
  sequenceOrder: number
  kegiatan: { name: string; starRating: number }[]
 }[]
 extraTopicsCount?: number
 narrative: string
 /** Boleh null/undefined (payload lama/DTO tanpa misi) — section tetap render
 *  dengan teks "Tidak ada misi dirumah", tidak pernah throw. */
 missions: string[] | null
 badgeTopics: { badgeName: string; badgeImageUrl?: string }[]
 badgeFinal?: { badgeName: string; badgeImageUrl?: string }
 facilitatorName: string
 galleryUrl?: string
 partnerLogoUrl?: string
 kidversaLogoUrl?: string
}

function sanitize(str: string): string {
 return str.replace(/[\/\\:*?"<>|]/g, '_').trim()
}

/** HTML-escape untuk setiap nilai dinamis yang disisipkan ke markup atau atribut.
 *  Nama Topik/Ke iatan/badge/sekolah/kelompok berasal dari input staff, sehingga
 *  markup mentah di sana akan tereksekusi di preview & capture. */
function esc(v: unknown): string {
 return String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')
}

function dashIfEmpty(v?: string): string {
 return v && v.trim() ? esc(v) : '—'
}

/** Skala transform terbesar agar konten PROFIL ANAK MUAT di dalam kartunya.
 *  Rumus murni geometri terukur (tanpa angka tetap / cap arbitrer):
 *    scale = min(availableWidth / contentWidth, availableHeight / contentHeight)
 *  Ini adalah skala terbesar yang memenuhi contentWidth·scale ≤ availableWidth
 *  DAN contentHeight·scale ≤ availableHeight sekaligus:
 *  - konten lebih kecil dari kotak → skala tumbuh > 1 (mengisi kartu, termasuk
 *    sisi kanan yang kosong);
 *  - skala hanya turun < 1 saat konten melebihi kotak (tumpang tindih);
 *  - batas sama persis → tepat 1.
 *  Dimensi tidak valid (≤ 0 atau NaN) → 1 (no-op aman, selaras __fitBadgeLabel).
 *  Sumber tunggal rumus ini dipakai unit test DAN disuntikkan ke skrip runtime
 *  `__fitProfilAnak` (miniRaport.ts <head>) lewat `.toString()`. */
export function computeProfilAnakScale(
 contentWidth: number,
 contentHeight: number,
 availableWidth: number,
 availableHeight: number,
): number {
 if (
  !(contentWidth > 0) ||
  !(contentHeight > 0) ||
  !(availableWidth > 0) ||
  !(availableHeight > 0)
 )
  return 1
 return Math.min(availableWidth / contentWidth, availableHeight / contentHeight)
}

/** Bobot flex-grow satu blok stage di kartu LEVEL KEGIATAN = jumlah baris
 *  visualnya (header KEGIATAN/BINTANG/LEVEL + satu baris per kegiatan) supaya
 *  tinggi kartu yang tersedia terbagi rata ke SEMUA baris (bukan hanya antar
 *  blok): stage berisi 5 kegiatan memperoleh bobot 6, stage berisi 1 kegiatan
 *  bobot 2, stage tanpa kegiatan (empty state) bobot 1. Dipakai stageRowHTML
 *  sebagai inline style dan dipakai unit test; bobot saja tidak mengubah
 *  tinggi alami (hanya aktif saat __fitLevelKegiatan men-set tinggi layout). */
export function computeLevelStageGrowWeight(kegiatanCount: number): number {
 return kegiatanCount > 0 ? kegiatanCount + 1 : 1
}

/** Skala transform terbesar agar tabel LEVEL KEGIATAN MUAT sekaligus MENGISI
 *  kartunya (row-span-3: tinggi baris grid dipaksa foto MOMEN, sehingga dengan
 *  5 kegiatan isi tabel jauh lebih pendek dari kartunya — ruang kosong di bawah
 *  harus terpakai). Rumus murni geometri terukur (tanpa angka tetap / cap
 *  arbitrer):
 *    scale = min(availableWidth / contentWidth, availableHeight / contentHeight)
 *  Prioritas skala BESAR: konten lebih kecil dari kotak → tumbuh > 1 (nama,
 *  bintang, dan pill LEVEL membesar); tinggi visual yang belum penuh (bila
 *  lebar membatasi skala) dibagikan ke tiap baris oleh tinggi layout
 *  availableHeight/scale + bobot flex-grow (computeLevelStageGrowWeight) sehingga
 *  tabel memakan area putih di bawah. Turun < 1 HANYA saat konten melebihi
 *  kotak (tumpang tindih) — clamp geometri kedua sumbu, bukan angka tetap.
 *  Dimensi tidak valid (≤ 0 atau NaN) → 1 (no-op aman, selaras
 *  computeProfilAnakScale/__fitBadgeLabel). Sumber tunggal rumus ini dipakai
 *  unit test DAN disuntikkan ke skrip runtime `__fitLevelKegiatan`
 *  (miniRaport.ts <head>) lewat `.toString()`. */
export function computeLevelKegiatanScale(
 contentWidth: number,
 contentHeight: number,
 availableWidth: number,
 availableHeight: number,
): number {
 if (
  !(contentWidth > 0) ||
  !(contentHeight > 0) ||
  !(availableWidth > 0) ||
  !(availableHeight > 0)
 )
  return 1
 return Math.min(availableWidth / contentWidth, availableHeight / contentHeight)
}

/** Jumlah slot bintang: domain skor 0..4, konsisten dengan max=4 di ReportAssessmentScores. */
const STAR_SLOTS = 4

function starsHTML(rating: number): string {
 return Array.from({ length: STAR_SLOTS }, (_, i) =>
  i < Math.min(rating, STAR_SLOTS)
   ? '<i class="fas fa-star text-brand-star"></i>'
   : '<i class="fas fa-star text-gray-200"></i>'
 ).join('')
}

function stageRowHTML(
 stage: MiniRaportData['stages'][0],
 _index: number,
 isLast: boolean
): string {
 const border = isLast ? '' : 'border-b border-dashed border-gray-200 pb-3'
 // Distribusi tinggi kartu LEVEL KEGIATAN (lihat __fitLevelKegiatan): bobot
 // flex-grow = jumlah baris visual (computeLevelStageGrowWeight) supaya tinggi
 // yang tersedia terbagi rata antar-baris; blok stage jadi flex-col agar tinggi
 // terbagi diteruskan ke baris-barisnya. Inline style saja — tanpa kelas baru,
 // tanpa perubahan ukuran alami (grow hanya aktif bila wadahnya ber-set tinggi).
 const grow = computeLevelStageGrowWeight(stage.kegiatan?.length ?? 0)
 const rowStyle = ' style="flex-grow:1;flex-shrink:0"'
 const kegiatan = stage.kegiatan && stage.kegiatan.length
  ? `<div class="flex items-center gap-2 pb-1 border-b border-gray-200"${rowStyle}><span class="flex-1 min-w-0 text-[10px] font-bold tracking-wider text-gray-400">KEGIATAN</span><span class="shrink-0 text-[10px] font-bold tracking-wider text-gray-400">BINTANG</span><span class="w-12 text-center shrink-0 text-[10px] font-bold tracking-wider text-gray-400">LEVEL</span></div>` +
  stage.kegiatan
   .map(
    (k, ki, arr) => `
          <div class="flex items-center gap-2 py-1${ki === arr.length - 1 ? '' : ' border-b border-dashed border-gray-200'}"${rowStyle}>
            <span class="flex-1 min-w-0 truncate text-[12px] font-semibold text-gray-700">${esc(k.name)}</span>
            <span class="shrink-0 flex gap-0.5 text-brand-star text-sm">${starsHTML(k.starRating)}</span>
            <span class="w-12 text-center shrink-0 inline-flex items-center justify-center px-1 py-0.5 rounded-full bg-brand-lightPurple text-brand-purple font-black text-[12px]">${RATING_ABBREVIATIONS[k.starRating] ?? '–'}</span>
          </div>`
   )
   .join('')
  : '<p class="text-[11px] text-gray-400 italic" style="flex-grow:1;flex-shrink:0;display:flex;flex-direction:column;justify-content:center">Belum ada kegiatan tercatat.</p>'
 return `
    <div class="${border}" style="display:flex;flex-direction:column;flex-grow:${grow};flex-shrink:0">
      <div class="flex flex-col gap-1.5" style="flex-grow:1">${kegiatan}</div>
    </div>`
}

function missionsHTML(missions: string[] | null | undefined): string {
 if (!missions || missions.length === 0)
  return '<p class="text-[12px] text-gray-500 italic">Tidak ada misi dirumah</p>'
 return missions
  .slice(0, 4)
  .map(
   (m) => `
      <div class="flex items-start gap-2 min-w-0">
        <i class="far fa-square text-brand-green text-base shrink-0 mt-0.5"></i>
        <p class="text-[12px] font-bold text-gray-700 leading-snug line-clamp-2">${esc(m)}</p>
      </div>`
  )
  .join('')
}

/** Satu gambar badge — section ini hanya menampilkan GAMBAR (maksimal 2:
 *  badge topik pertama + badge final). Tanpa ikon fallback & tanpa nama
 *  terlihat; nama tetap di `alt`. URL kosong → ''; gambar gagal dimuat
 *  disembunyikan oleh onerror (tanpa swap ikon) agar capture/PDF tidak
 *  menampilkan ikon/gambar rusak. */
function badgeImageHTML(b?: { badgeName: string; badgeImageUrl?: string }): string {
 if (!b || !b.badgeImageUrl) return ''
 // `block w-full h-full` → kotak <img> PERSIS seukuran slot (fill), sehingga
 // objek contain yang me-letterbox membuat gambar memenuhi area isi section;
 // tanpa cap maksimum (max-h-10 dkk) dan tanpa object-cover (crop/stretch).
 return `<img src="${esc(b.badgeImageUrl)}" alt="${esc(b.badgeName)}" class="block w-full h-full object-contain rounded" onerror="this.style.display='none'" />`
}

/** Section isi BADGE PENCAPAIAN: MAKSIMAL 2 gambar — slot kiri `badgeTopics[0]`,
 *  slot kanan `badgeFinal`. Kedua `data-badge-slot` tetap dirender sebagai anchor
 *  struktural (boleh kosong bila badge itu tidak ada/tidak bergambar), TANPA
 *  divider. Slot terisi memakai `flex-1 min-w-0` sehingga kotak gambar MENGISI
 *  area isi kartu: 2 badge → masing-masing setengah lebar (gap kecil di
 *  antaranya), 1 badge → lebar penuh; tinggi kedua kasus sama karena grup
 *  `items-stretch` mengikuti tinggi konten kartu (letterboxing diserap contain).
 *  Inline `min-height:0` menetralkan auto-minimum flex item agar tinggi gambar
 *  alami tidak membengkakkan kartu. Grup di-center (gap hanya saat keduanya
 *  terisi). Tidak ada satu pun gambar → empty-state (tanpa slot, persis seperti
 *  format lama). */
function badgeSectionHTML(data: MiniRaportData): string {
 const topik = badgeImageHTML(data.badgeTopics?.[0])
 const finalHTML = badgeImageHTML(data.badgeFinal)
 if (!topik && !finalHTML)
  return '<p class="text-[12px] text-gray-500 italic">Belum ada badge yang diraih.</p>'
 const groupClass =
  topik && finalHTML
   ? 'flex items-stretch gap-3 justify-center'
   : 'flex items-stretch justify-center'
 const slot = (name: 'topik' | 'final', content: string): string =>
  content
   ? `<div class="flex-1 min-w-0" data-badge-slot="${name}">${content}</div>`
   : `<div data-badge-slot="${name}"></div>`
 return `
            <div class="${groupClass}" style="min-height:0">
              ${slot('topik', topik)}
              ${slot('final', finalHTML)}
            </div>`
}

function narrativeBlock(data: MiniRaportData): string {
 const raw = (data.narrative || '').trim()
 if (!raw) return '<span class="italic text-gray-500">Belum ada ringkasan.</span>'
 // Buang titik-titik "....." dan spasi di akhir ringkasan
 const cleaned = raw.replace(/[.\s]+$/, '').trim()
 return esc(cleaned)
}

export function generateMiniRaportHTML(data: MiniRaportData): string {
 const photoBlock = data.photoUrl
  ? `<img src="${esc(data.photoUrl)}" alt="${esc(data.childName)}" class="w-full h-full object-contain" />`
  : `<i class="fas fa-image text-5xl opacity-30"></i>
       <span class="font-bold text-sm tracking-widest">[ PLACEHOLDER FOTO ANAK ]</span>`

 const stagesBlock = data.stages.length
  ? (() => {
   const shown = data.stages.slice(0, 4)
   const rows = shown
    .map((s, i) => stageRowHTML(s, i, i === shown.length - 1))
    .join('')
   const extra =
    data.extraTopicsCount && data.extraTopicsCount > 0
     ? `<div class="text-[11px] text-gray-400 italic mt-1" style="flex-shrink:0">Topik lain: ${esc(data.extraTopicsCount)}</div>`
     : ''
   return rows + extra
  })()
  : '<p class="text-sm text-gray-500 italic" style="flex-grow:1;flex-shrink:0;display:flex;flex-direction:column;justify-content:center">Belum ada data topik.</p>'

 const kidversaLogo = data.kidversaLogoUrl
  ? `<img src="${esc(data.kidversaLogoUrl)}" alt="Kidversa" class="w-full h-16 object-contain" />`
  : '<img src="/logo.png" alt="Kidversa" class="w-full h-16 object-contain" />'

 const partnerLogo = data.partnerLogoUrl
  ? `<img src="${esc(data.partnerLogoUrl)}" alt="Partner" class="w-full h-12 object-contain" />`
  : ''

 return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mini Raport - ${esc(sanitize(data.childName))} - ${esc(data.sessionDate)}</title>

    <!-- FontAwesome SVG + JS (converts <i> → <svg> automatically) -->
    <script defer src="/fonts/fa/js/fontawesome.min.js"></script>
    <script defer src="/fonts/fa/js/solid.min.js"></script>
    <script defer src="/fonts/fa/js/regular.min.js"></script>

    <!-- Pre-compiled Tailwind CSS (no CDN) -->
    <style>${MINI_RAPORT_TAILWIND_CSS}</style>

    <style>
        *, *::before, *::after { box-sizing: border-box; }
        html { margin: 0; padding: 0; }
        body {
            margin: 0;
            padding: 0;
            font-family: 'Nunito', sans-serif;
            -webkit-font-smoothing: antialiased;
            background: #e5e7eb;
            color: #334155;
        }

        /* Local web fonts (served from /public/fonts) */
        @font-face {
            font-family: 'Nunito';
            font-style: normal;
            font-weight: 400;
            src: url('/fonts/nunito/Nunito-Regular.ttf') format('truetype');
        }
        @font-face {
            font-family: 'Nunito';
            font-style: normal;
            font-weight: 600;
            src: url('/fonts/nunito/Nunito-SemiBold.ttf') format('truetype');
        }
        @font-face {
            font-family: 'Nunito';
            font-style: normal;
            font-weight: 700;
            src: url('/fonts/nunito/Nunito-Bold.ttf') format('truetype');
        }
        @font-face {
            font-family: 'Nunito';
            font-style: normal;
            font-weight: 800;
            src: url('/fonts/nunito/Nunito-ExtraBold.ttf') format('truetype');
        }
        @font-face {
            font-family: 'Nunito';
            font-style: normal;
            font-weight: 900;
            src: url('/fonts/nunito/Nunito-Black.ttf') format('truetype');
        }
        @font-face {
            font-family: 'Caveat';
            font-style: normal;
            font-weight: 700;
            src: url('/fonts/caveat/Caveat-Bold.ttf') format('truetype');
        }
        .ribbon-container {
            position: relative;
            display: inline-block;
            margin-top: 0.5rem;
        }
        .ribbon-tail-left {
            position: absolute;
            left: -12px;
            bottom: -8px;
            border-top: 20px solid #689c27;
            border-left: 15px solid transparent;
            z-index: -1;
        }
        .ribbon-tail-right {
            position: absolute;
            right: -12px;
            bottom: -8px;
            border-top: 20px solid #689c27;
            border-right: 15px solid transparent;
            z-index: -1;
        }
        ::-webkit-scrollbar { width: 0; background: transparent; }

        /* ===== Layout A4: footer menempel di bawah lembar =====
           Dimensi kertas (width/height 210mm/297mm) didefinisikan di
           miniRaport.tailwind.css agar berdampingan dengan override mode-card
           (max-width: 480px) dan tetap sebagai CSS statis yang dibaca @source. */
        .a4-sheet {
            display: flex;
            flex-direction: column;
        }
        .raport-main {
            flex: 1 1 auto;
            min-height: 0;
        }

        /* ===== Skala dinamis isi lembar (container fixed 210mm × 297mm) =====
           #raport-scale membungkus seluruh kartu di dalam .raport-main.
           Lembar & .raport-main TIDAK berubah — hanya isi yang diskalakan
           (transform:scale, dihitung di klien oleh __fitRaport) agar tinggi
           cat selalu <= ruang .raport-main: konten muat, tidak menimpa
           footer, tidak terpotong overflow-hidden lembar. */
        .raport-scale {
            transform-origin: top left;
        }

        /* ===== Footer: divider pemisah copyright (kiri) dan QR galeri (kanan) ===== */
        .raport-divider {
            width: 1px;
            align-self: stretch;
            margin: 2px 0;
            background: rgba(255, 255, 255, 0.35);
        }
        .raport-footer-qr {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex-shrink: 0;
        }
        .raport-qr-caption {
            text-align: right;
            max-width: 170px;
        }
    </style>

    <style>
        /* @page { size: A4; margin: 0 } serta dimensi cetak .a4-sheet
           (210mm × 297mm) kini hidup di miniRaport.tailwind.css — satu sumber
           geometri kertas untuk layar DAN cetak. Blok ini hanya penyesuaian
           dokumen saat cetak; geometri lembar tetap statis tanpa skala.
           Skala isi (#raport-scale oleh __fitRaport) berlaku sama saat cetak —
           listener beforeprint menghitung ulang tepat sebelum kertas dicetak. */
        @media print {
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            html {
                width: 210mm !important;
                height: 297mm !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            body {
                width: 210mm !important;
                margin: 0 !important;
                padding: 0 !important;
                display: block !important;
                background: #ffffff !important;
            }
            .a4-sheet {
                /* Dimensi kertas (width/height 210mm/297mm) & @page berasal
                   dari miniRaport.tailwind.css — di sini hanya tata letak
                   lembar saat cetak; lembar itu sendiri tanpa transform
                   (skala transform hanya pada isi #raport-scale). */
                display: flex !important;
                flex-direction: column !important;
                margin: 0 !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
            .raport-main { flex: 1 1 auto !important; }
            .a4-sheet > :last-child {
                border-radius: 0 !important;
            }
        }
    </style>

    <script>
        function __scaleRingkasan() {
            var card = document.getElementById('ringkasan-card')
            var text = document.getElementById('ringkasan-text')
            if (!card || !text) return
            var maxH = 140
            var curH = card.scrollHeight
            if (curH > maxH) {
                var s = Math.max(0.7, maxH / curH)
                text.style.transform = 'scale(' + s + ')'
                text.style.transformOrigin = 'top left'
                text.style.width = (100 / s) + '%'
            }
        }

        /* ===== Skala dinamis label "BADGE PENCAPAIAN" (selalu satu baris) =====
           Pill (id badge-achievement-label) adalah flex shrink-to-fit di dalam
           kartu section 4 (position:relative = containing block = offsetParent);
           lebar alami teksnya bisa melampaui ruang sisa sehingga patah dua baris.
           Rumusnya murni fungsi geometri terukur (tanpa angka tetap):
             natural   = pill.offsetWidth
                         // lebar max-content SATU baris (white-space:nowrap;
                         // transform di-reset dulu agar ukuran alami murni)
             available = card.clientWidth - 2 * pill.offsetLeft
                         // gutter kiri = pill.offsetLeft (left-5), gutter
                         // kanan simetris dari geometri kartu yang sama
             scale     = Math.min(1, available / natural)
           transform-origin 'left center': tepi kiri tetap anchor di left-5 DAN
           titik tengah vertikal pill tetap pada tepi atas kartu (offset -top-3,
           pill selalu “menumpang” seimbang di atas border kartu). Tanpa
           overflow:hidden/pemotongan — teks "BADGE PENCAPAIAN" selalu utuh,
           hanya diskalakan. Aman dipanggil berulang (idempoten) & no-op bila
           elemennya tidak ada. */
        function __fitBadgeLabel() {
            var pill = document.getElementById('badge-achievement-label')
            if (!pill) return
            var card = pill.offsetParent
            if (!card) return
            pill.style.whiteSpace = 'nowrap'
            pill.style.transform = 'none' // reset → pengukuran alami murni
            var natural = pill.offsetWidth
            var available = card.clientWidth - 2 * pill.offsetLeft
            if (natural <= 0 || available <= 0) return
            var s = Math.min(1, available / natural)
            pill.style.transformOrigin = 'left center'
            pill.style.transform = s < 1 ? 'scale(' + s + ')' : ''
        }

        /* ===== Skala dinamis isi kartu PROFIL ANAK (grid 2 kolom max-content) =====
           Fields (#profil-anak-fields) di-reset dulu agar ukuran alami murni
           (whitespace-nowrap, tanpa truncate → nilai tak pernah terpotong),
           lalu diskalakan agar muat SEKALIGUS mengisi kartu
           (#profil-anak-card, content-box = client − padding):
             natural = fields.offsetWidth / offsetHeight  (grid max-content)
             available = card.clientWidth − padX, card.clientHeight − padY
             scale = min(availableW / naturalW, availableH / naturalH)
           Rumusnya fungsi murni computeProfilAnakScale (diekspor dari
           miniRaport.ts dan disuntikkan di bawah sebagai sumber tunggal):
           skala terbesar yang tetap muat — tumbuh > 1 mengisi sisi kanan kartu
           yang kosong, hanya turun saat konten melebihi kotak (tumpang tindih).
           transform tidak mengubah layout kartu sehingga pengukuran global
           __fitRaport tetap konvergen. Aman dipanggil berulang (idempoten) &
           no-op bila elemennya tidak ada. */
        var __computeProfilAnakScale = ${computeProfilAnakScale.toString()}
        function __fitProfilAnak() {
            var card = document.getElementById('profil-anak-card')
            var fields = document.getElementById('profil-anak-fields')
            if (!card || !fields) return
            fields.style.transform = 'none' // reset → pengukuran alami murni
            var naturalW = fields.offsetWidth
            var naturalH = fields.offsetHeight
            var cs = window.getComputedStyle ? window.getComputedStyle(card) : null
            var padX = cs ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) : 32
            var padY = cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 40
            var s = __computeProfilAnakScale(naturalW, naturalH, card.clientWidth - padX, card.clientHeight - padY)
            fields.style.transformOrigin = 'top left'
            fields.style.transform = s !== 1 ? 'scale(' + s + ')' : ''
        }

        /* ===== Skala + distribusi tinggi isi kartu LEVEL KEGIATAN =====
           Konten (#level-kegiatan-rows) berukuran max-content (lebar alami baris
           terpanjang → nama kegiatan tak pernah terpotong), di-reset dulu agar
           ukuran alami murni, lalu diskalakan agar muat SEKALIGUS mengisi kartu
           (#level-kegiatan-card, content-box = client − padding):
             natural   = rows.offsetWidth / offsetHeight  (max-content)
             available = card.clientWidth − padX, card.clientHeight − padY − marginTop
             scale     = computeLevelKegiatanScale(naturalW, naturalH, availW, availH)
                       = min(availW / naturalW, availH / naturalH)  ← clamp geometri
           Prioritas skala besar: konten kecil (mis. 5 kegiatan) → tumbuh > 1,
           nama/bintang/pill LEVEL membesar; bila skala dibatasi lebar sehingga
           tinggi visual belum penuh, tinggi LAYOUT di-set availH/scale sehingga
           tinggi visual (= × scale) pas mengisi kartu DAN sisa ruangnya terbagi
           rata ke tiap baris oleh bobot flex-grow inline (computeLevelStageGrowWeight
           di stageRowHTML) — area putih di bawah ikut terpakai. Skala turun < 1
           HANYA saat konten melebihi kotak: tinggi layout otomatis dikembalikan
           (konten alami) lalu transform mengecilkannya ke tepi kartu.
           transform tidak mengubah layout kartu sehingga pengukuran global
           __fitRaport tetap konvergen. Aman dipanggil berulang (idempoten) &
           no-op bila elemennya tidak ada. */
        var __computeLevelKegiatanScale = ${computeLevelKegiatanScale.toString()}
        function __fitLevelKegiatan() {
            var card = document.getElementById('level-kegiatan-card')
            var rows = document.getElementById('level-kegiatan-rows')
            if (!card || !rows) return
            rows.style.transform = 'none' // reset → pengukuran alami murni
            rows.style.height = ''
            var naturalW = rows.offsetWidth
            var naturalH = rows.offsetHeight
            var cs = window.getComputedStyle ? window.getComputedStyle(card) : null
            var padX = cs ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) : 40
            var padY = cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 44
            var rs = window.getComputedStyle ? window.getComputedStyle(rows) : null
            var marginTop = rs ? parseFloat(rs.marginTop) || 0 : 4
            var availW = card.clientWidth - padX
            var availH = card.clientHeight - padY - marginTop
            var s = __computeLevelKegiatanScale(naturalW, naturalH, availW, availH)
            // Tinggi layout = availH/s → tinggi VISUAL (tinggi × s) pas mengisi
            // kartu. Hanya untuk s ≥ 1 (availH/s ≤ availH → tanpa overflow
            // layout, pengukuran __fitRaport tidak terpengaruh).
            rows.style.height = s >= 1 && availH > 0 ? (availH / s) + 'px' : ''
            rows.style.transformOrigin = 'top left'
            rows.style.transform = s !== 1 ? 'scale(' + s + ')' : ''
        }

        /* ===== Skala dinamis isi lembar (container fixed 210mm × 297mm) =====
           Geometri kertas TIDAK berubah: .a4-sheet tetap 210mm × 297mm dan
           .raport-main tetap flex item berukuran sisa ruang. #raport-scale
           (pembungkus seluruh kartu) diskalakan transform:scale agar tinggi
           cat <= ruang .raport-main — konten selalu muat, tidak menimpa
           footer, dan tidak terpotong overflow-hidden lembar.
           Rasio diukur di klien: pass-1 lebar dikompensasi (100/s)% agar baris
           menjadi lebih panjang, lalu diukur ulang sampai konvergen (maks 5
           iterasi). __scaleRingkasan tetap menangani overflow internal kartu
           ringkasan. Sentinel data-fit dipakai raportCapture.ts agar capture
           tidak mengambil dokumen sebelum skala diterapkan. */
        function __fitRaport() {
            var main = document.querySelector('.raport-main')
            var wrap = document.getElementById('raport-scale')
            if (!main || !wrap) return
            var cs = window.getComputedStyle ? window.getComputedStyle(main) : null
            var padY = cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 48
            var budget = main.clientHeight - padY
            wrap.setAttribute('data-fit', '') // refit sedang berjalan
            if (budget <= 0) return
            var s = 1
            for (var i = 0; i < 5; i++) {
                wrap.style.width = s === 1 ? '' : (100 / s) + '%'
                var natural = wrap.offsetHeight
                if (!natural) break
                var next = Math.min(1, budget / natural)
                if (Math.abs(next - s) < 0.005) { s = next; break }
                s = next
            }
            wrap.style.width = s === 1 ? '' : (100 / s) + '%'
            wrap.style.transformOrigin = 'top left'
            wrap.style.transform = s < 1 ? 'scale(' + s + ')' : ''
            wrap.setAttribute('data-fit', 'done')
        }

        var __fitQueued = false
        function __scheduleFit() {
            if (__fitQueued) return
            __fitQueued = true
            setTimeout(function () { __fitQueued = false; __fitRaport(); __fitBadgeLabel(); __fitProfilAnak(); __fitLevelKegiatan() }, 0)
        }

        function __initFit() {
            __fitRaport()
            __fitProfilAnak()
            __fitLevelKegiatan()
            // Web font (Nunito/Caveat) mengubah tinggi teks setelah paint pertama.
            if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
                document.fonts.ready.then(__scheduleFit, function () {})
            }
            if (window.ResizeObserver) {
                var ro = new ResizeObserver(__scheduleFit)
                var targets = [
                    document.querySelector('.a4-sheet'),
                    document.querySelector('.raport-main'),
                    document.getElementById('raport-scale')
                ]
                for (var i = 0; i < targets.length; i++) {
                    if (targets[i]) ro.observe(targets[i])
                }
            }
            // Konversi ikon FontAwesome (<i> → <svg>) & fallback gambar mengubah
            // tinggi kartu: pengamatan struktur DOM memicu pengukuran ulang.
            if (window.MutationObserver) {
                var wrap = document.getElementById('raport-scale')
                if (wrap) {
                    new MutationObserver(__scheduleFit).observe(wrap, { childList: true, subtree: true })
                }
            }
            // Cetak (Ctrl+P / window.print) mengukur ulang tepat sebelum kertas.
            if (window.addEventListener) {
                window.addEventListener('beforeprint', __fitRaport)
                window.addEventListener('beforeprint', __fitBadgeLabel)
                window.addEventListener('beforeprint', __fitProfilAnak)
                window.addEventListener('beforeprint', __fitLevelKegiatan)
            }
        }

        // Cetak: lembar selalu 210mm × 297mm (CSS @page/@media print di
        // miniRaport.tailwind.css) — tanpa --print-scale dinamis pada lembar;
        // skala isi dihitung ulang oleh __fitRaport lewat listener beforeprint.
        if (window.addEventListener) {
            window.addEventListener('DOMContentLoaded', function () {
                __scaleRingkasan()
                __fitBadgeLabel()
                __initFit()
            })
        } else if (window.attachEvent) {
            window.attachEvent('onload', function () {
                __scaleRingkasan()
                __fitBadgeLabel()
                __initFit()
            })
        }
    </script>
</head>
<body class="py-10 px-4 antialiased text-brand-text flex justify-center">

    <div class="a4-sheet bg-white rounded-[2rem] shadow-2xl relative overflow-hidden ring-1 ring-gray-200 z-10">

        <header class="flex justify-between items-start px-8 pt-4 pb-2 relative">

            <!-- Left Logo -->
            <div class="w-36 flex flex-col items-center gap-3 relative z-10 mt-2">
                ${kidversaLogo}
            </div>

            <!-- Center Title -->
            <div class="text-center flex-1 px-4 flex flex-col items-center z-20">
                <h1 class="text-brand-purple font-black text-[1.6rem] leading-none tracking-wide mb-1">MINI RAPORT ${esc(data.programName)}</h1>
                <h2 class="text-brand-purple font-black text-base leading-none mb-2">${esc(data.topicName)}</h2>
                <div class="ribbon-container">
                    <div class="bg-brand-green text-white px-6 py-1 rounded-full font-bold text-base relative z-10 shadow-sm border border-brand-green">
                        ${esc(data.sessionDate)}
                    </div>
                    <div class="ribbon-tail-left"></div>
                    <div class="ribbon-tail-right"></div>
                </div>
            </div>

            <!-- Right Logo -->
            <div class="w-36 flex flex-col items-center gap-3 relative z-10 mt-2">
                ${partnerLogo}
            </div>

            <div class="absolute bottom-0 left-8 right-8 border-b border-gray-100"></div>
        </header>

        <main class="raport-main px-8 py-6">
            <div id="raport-scale" class="raport-scale grid grid-cols-12 gap-4">

            <!-- 1. MOMEN TERBAIK HARI INI (melintasi 3 baris di kiri) -->
            <div class="col-span-4 row-span-3 relative flex flex-col">
                <div class="absolute -left-3 -top-4 z-20 bg-brand-badge text-white px-4 py-1.5 rounded-full font-bold text-[13px] shadow-md flex items-center gap-2 border-[2px] border-white">
                    <i class="fas fa-camera text-brand-star text-base"></i>
                    Momen Terbaik Hari Ini
                </div>
                <div class="w-full aspect-[9/16] mx-auto rounded-[1.5rem] border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col gap-2 justify-center items-center text-gray-400 relative overflow-hidden">
                    ${photoBlock}
                </div>
            </div>

            <!-- 2. PROFIL ANAK (grid 2 kolom max-content; skala dihitung __fitProfilAnak) -->
            <div id="profil-anak-card" class="col-span-8 bg-white border-[2px] border-brand-badge rounded-[1.5rem] p-4 relative pt-6">
                <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold flex items-center gap-2 z-10">
                    <i class="fas fa-user text-xs"></i> PROFIL ANAK
                </div>
                <!-- Grid 2×2 berukuran alami (max-content) memakai sisi kanan kartu
                     tanpa kelas Tailwind baru; setiap baris whitespace-nowrap tanpa
                     truncate sehingga nilai tak pernah terpotong. __fitProfilAnak
                     men-skalakan konten ke skala terbesar yang masih muat (computeProfilAnakScale). -->
                <div id="profil-anak-fields" class="text-[13px]" style="display:grid;grid-template-columns:repeat(2, max-content);column-gap:16px;row-gap:6px;width:max-content">
                    <div class="flex items-baseline gap-1 whitespace-nowrap">
                        <span class="text-brand-purple font-semibold">Nama Anak</span>
                        <span class="text-brand-purple font-black">: ${esc(data.childName)}</span>
                    </div>
                    <div class="flex items-baseline gap-1 whitespace-nowrap">
                        <span class="text-brand-purple font-semibold">Usia</span>
                        <span class="text-brand-purple font-black">: ${data.childAge > 0 ? data.childAge + ' Tahun' : '—'}</span>
                    </div>
                    <div class="flex items-baseline gap-1 whitespace-nowrap">
                        <span class="text-brand-purple font-semibold">Sekolah</span>
                        <span class="text-brand-purple font-black">: ${dashIfEmpty(data.childSchool)}</span>
                    </div>
                    <div class="flex items-baseline gap-1 whitespace-nowrap">
                        <span class="text-brand-purple font-semibold">Kelompok</span>
                        <span class="text-brand-purple font-black">: ${dashIfEmpty(data.childGroup)}</span>
                    </div>
                </div>
            </div>

            <!-- 3. LEVEL KEGIATAN (row-span-3: memanjang ke baris yang ditinggalkan
                 BADGE di kolom kanan, sejajar dengan dasar kartu BADGE di kolom kiri) -->
            <div id="level-kegiatan-card" class="col-span-8 row-span-3 bg-white border-2 border-gray-200 rounded-[1.5rem] p-5 pt-6 relative mt-2">
                <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold shadow-md flex items-center gap-2 z-10">
                    <i class="fas fa-star text-brand-star text-xs"></i> LEVEL KEGIATAN
                </div>
                <!-- Tabel berukuran max-content (lebar baris terpanjang → nama tak
                     pernah terpotong). __fitLevelKegiatan men-skala ke skala
                     terbesar yang masih muat (computeLevelKegiatanScale) lalu
                     membagi tinggi kartu yang tersisa ke tiap baris lewat bobot
                     flex-grow sehingga tabel mengisi kartu (area putih bawah ikut
                     terpakai). -->
                <div id="level-kegiatan-rows" class="flex flex-col gap-2 mt-1" style="width:max-content">
                    ${stagesBlock}
                </div>
            </div>

            <!-- 4. BADGE PENCAPAIAN (auto-placement menaruhnya di baris 4 kolom kiri,
                 tepat di bawah kartu Momen Terbaik; kolom kanan diisi LEVEL KEGIATAN) -->
            <div class="col-span-4 bg-white border-2 border-brand-badge rounded-[1.25rem] p-3 flex flex-col shadow-sm relative min-h-[100px] mt-2">
                <!-- padding seragam p-3 (12px) di SEMUA sisi: tinggi konten =
                     100px (min-h) − 4px border − 24px padding = 72px, dipakai
                     penuh oleh grup gambar (flex-1) berapa pun tinggi baris grid. -->
                <div id="badge-achievement-label" class="absolute left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold shadow-md flex items-center gap-2 z-10 whitespace-nowrap" style="top:-20px">
                    <i class="fas fa-award text-xs"></i> BADGE PENCAPAIAN
                </div>
                ${badgeSectionHTML(data)}
            </div>

            <!-- 5. RINGKASAN (full-width, max-height dengan auto-scale) -->
            <div id="ringkasan-card" class="col-span-12 bg-brand-lightGreen rounded-[1.5rem] p-3.5 shadow-sm max-h-[140px] overflow-hidden">
                <h4 class="font-bold text-brand-darkGreen flex items-center gap-2 mb-1 shrink-0">
                    <i class="fas fa-star text-xs"></i> RINGKASAN
                </h4>
                <p id="ringkasan-text" class="text-[13px] font-semibold text-gray-800 leading-snug">${narrativeBlock(data)}</p>
            </div>

            <!-- 6a. MISI RUMAH BERSAMA KELUARGA -->
            <div class="col-span-6 bg-brand-yellow rounded-[1.25rem] p-4 pt-3 border border-yellow-200 shadow-sm relative">
                <div class="flex items-center gap-3 mb-3">
                    <span class="bg-orange-200 text-orange-600 w-8 h-8 rounded-xl flex items-center justify-center text-lg shadow-sm"><i class="fas fa-home"></i></span>
                    <h3 class="font-black text-brand-purple text-[13px]">MISI RUMAH BERSAMA KELUARGA</h3>
                </div>
                <div class="flex flex-col gap-3">
                    ${missionsHTML(data.missions)}
                </div>
            </div>

            <!-- 6b. PENGESAHAN + TTD -->
            <div class="col-span-6 bg-white border-2 border-gray-200 rounded-[1.25rem] p-4 pt-5 shadow-sm relative mt-2">
                <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold shadow-md flex items-center gap-2 z-10">
                    <i class="fas fa-pen text-xs"></i> PENGESAHAN
                </div>
                <div class="mt-1">
                    <p class="text-[11px] font-semibold text-gray-500 mb-0.5">Guru Fasilitator</p>
                    <p class="text-[13px] font-bold text-brand-purple mb-3">${esc(data.facilitatorName)}</p>
                    <div class="w-full h-[60px] border-2 border-dashed border-gray-300 rounded-lg bg-gray-50"></div>
                </div>
            </div>
            </div>
        </main>

        <!-- Footer: Copyright (kiri) | divider | QR Code Galeri (kanan) -->
        <div class="bg-[#795db2] text-white px-8 py-2 flex items-center gap-4 relative z-10 rounded-b-[2rem]">

            <!-- Kiri: Copyright -->
            <div class="flex-1 min-w-0">
                <p class="text-[10px] font-semibold opacity-95">&copy; 2026 | www.kidversa.fun</p>
            </div>

            <!-- Divider vertikal -->
            <div class="raport-divider shrink-0"></div>

            <!-- Kanan: QR Code Galeri -->
            <div class="raport-footer-qr">
                <div class="raport-qr-caption">
                    <div class="text-[9px] font-bold text-white/70 tracking-wider">Galeri Digital</div>
                    <div class="text-[9px] font-semibold text-white/70 italic">Scan untuk melihat galeri</div>
                </div>
                <div class="w-14 h-14 bg-white rounded-lg flex items-center justify-center shrink-0 shadow-sm p-1">
                    ${data.galleryUrl
   ? `<img src="${esc(data.galleryUrl)}" alt="QR Galeri" class="w-full h-full object-contain" />`
   : `<span class="text-gray-400 text-[8px] font-bold text-center leading-tight">[ QR CODE ]</span>`
  }
                </div>
            </div>
        </div>

    </div>

</body>
</html>`
}
import MINI_RAPORT_TAILWIND_CSS from './miniRaport.styles.css?inline'
import { RATING_LABELS, MAX_STAR_RATING } from '../../core/constants/assessment'

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
 missions: string[]
 badges: { badgeName: string; badgeImageUrl?: string }[]
 facilitatorName: string
 facilitatorPhotoUrl?: string
 galleryUrl?: string
 partnerLogoUrl?: string
 kidversaLogoUrl?: string
}

function sanitize(str: string): string {
 return str.replace(/[\/\\:*?"<>|]/g, '_').trim()
}

/** HTML-escape untuk setiap nilai dinamis yang disisipkan ke markup atau atribut.
 *  Nama Topik/Kegiatan/badge/sekolah/kelompok berasal dari input staff, sehingga
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

function starsHTML(rating: number): string {
 return Array.from({ length: MAX_STAR_RATING }, (_, i) =>
  i < rating
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
 const kegiatan = stage.kegiatan && stage.kegiatan.length
  ? stage.kegiatan
   .map(
    (k) => `
          <div class="flex items-center justify-between gap-2">
            <span class="text-[12px] font-semibold text-gray-700 truncate">${esc(k.name)}</span>
            <span class="flex items-center gap-2 shrink-0">
              <span class="flex gap-0.5 text-brand-star text-sm">${starsHTML(k.starRating)}</span>
              <span class="text-[11px] text-gray-600 shrink-0">${RATING_LABELS[k.starRating] ?? ''}</span>
            </span>
          </div>`
   )
   .join('')
  : '<p class="text-[11px] text-gray-400 italic">Belum ada kegiatan tercatat.</p>'
 return `
    <div class="${border}">
      <div class="flex flex-col gap-1.5">${kegiatan}</div>
    </div>`
}

function missionsHTML(missions: string[]): string {
 if (missions.length === 0)
  return '<p class="text-[12px] text-gray-500 italic">Belum ada misi yang dipilih.</p>'
 return missions
  .slice(0, 4)
  .map(
   (m) => `
      <div class="flex items-start gap-2 min-w-0">
        <i class="fas fa-square-check text-brand-green text-base shrink-0 mt-0.5"></i>
        <p class="text-[12px] font-bold text-gray-700 leading-snug line-clamp-2">${esc(m)}</p>
      </div>`
  )
  .join('')
}

function badgeHTML(badges: { badgeName: string; badgeImageUrl?: string }[]): string {
 if (!badges || badges.length === 0)
  return '<p class="text-[12px] text-gray-500 italic">Belum ada badge yang diraih.</p>'
 const items = badges
  .slice(0, 4)
  .map((b) => {
   const inner = b.badgeImageUrl
    ? `<img src="${esc(b.badgeImageUrl)}" alt="${esc(b.badgeName)}" class="w-8 h-8 object-contain rounded" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';" />
           <i class="fas fa-award text-brand-badge text-xl hidden"></i>`
    : '<i class="fas fa-award text-brand-badge text-xl"></i>'
   return `
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-8 h-8 flex items-center justify-center shrink-0">${inner}</div>
          <span class="text-[11px] font-semibold text-gray-700 truncate">${esc(b.badgeName)}</span>
        </div>`
  })
  .join('')
 return `<div class="flex flex-wrap gap-3">${items}</div>`
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
  ? `<img src="${esc(data.photoUrl)}" alt="${esc(data.childName)}" class="w-full h-full object-cover" />`
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
     ? `<div class="text-[11px] text-gray-400 italic mt-1">Topik lain: ${esc(data.extraTopicsCount)}</div>`
     : ''
   return rows + extra
  })()
  : '<p class="text-sm text-gray-500 italic">Belum ada data topik.</p>'

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

        /* ===== Layout A4: sheet selalu setinggi kertas, footer menempel di bawah ===== */
        .a4-sheet {
            display: flex;
            flex-direction: column;
            min-height: 297mm;
        }
        .raport-main {
            flex: 1 1 auto;
            min-height: 0;
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
        @page {
            size: A4 portrait;
            margin: 0;
        }
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
                width: 210mm !important;
                max-width: 210mm !important;
                min-height: 297mm !important;
                display: flex !important;
                flex-direction: column !important;
                margin: 0 !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                transform: scale(var(--print-scale, 1));
                transform-origin: top center;
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
        function __raportBeforePrint() {
            var sheet = document.querySelector('.a4-sheet')
            if (!sheet) return
            var rect = sheet.getBoundingClientRect()
            if (!rect || !rect.height) return
            var hMm = (rect.height / 96) * 25.4
            var scale = Math.min(1, 297 / hMm)
            document.documentElement.style.setProperty('--print-scale', String(scale))
        }

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

        if (window.addEventListener) {
            window.addEventListener('beforeprint', __raportBeforePrint)
            window.addEventListener('DOMContentLoaded', __scaleRingkasan)
        } else if (window.attachEvent) {
            window.attachEvent('onbeforeprint', __raportBeforePrint)
            window.attachEvent('onload', __scaleRingkasan)
        }
    </script>
</head>
<body class="py-10 px-4 antialiased text-brand-text flex justify-center">

    <div class="a4-sheet w-full max-w-[210mm] bg-white rounded-[2rem] shadow-2xl relative overflow-hidden ring-1 ring-gray-200 z-10">

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

        <main class="raport-main grid grid-cols-12 gap-3 px-8 py-6">

            <!-- 1. MOMEN TERBAIK HARI INI (melintasi 3 baris di kiri) -->
            <div class="col-span-4 row-span-3 relative flex flex-col">
                <div class="absolute -left-3 -top-4 z-20 bg-brand-badge text-white px-4 py-1.5 rounded-full font-bold text-[13px] shadow-md flex items-center gap-2 border-[2px] border-white">
                    <i class="fas fa-camera text-brand-star text-base"></i>
                    Momen Terbaik Hari Ini
                </div>
                <div class="w-full h-full rounded-[1.5rem] border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col gap-2 justify-center items-center text-gray-400 relative overflow-hidden">
                    ${photoBlock}
                </div>
            </div>

            <!-- 2. PROFIL ANAK (vertikal, kolom kanan) -->
            <div class="col-span-8 bg-white border-[2px] border-brand-badge rounded-[1.5rem] p-4 relative pt-6">
                <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold flex items-center gap-2 z-10">
                    <i class="fas fa-user text-xs"></i> PROFIL ANAK
                </div>
                <div class="flex flex-col gap-1.5 text-[13px]">
                    <div class="flex items-baseline gap-1">
                        <span class="text-brand-purple font-semibold w-28 shrink-0 whitespace-nowrap">Nama Anak</span>
                        <span class="text-brand-purple font-black truncate min-w-0 flex-1">: ${esc(data.childName)}</span>
                    </div>
                    <div class="flex items-baseline gap-1">
                        <span class="text-brand-purple font-semibold w-28 shrink-0 whitespace-nowrap">Usia</span>
                        <span class="text-brand-purple font-black truncate min-w-0 flex-1">: ${data.childAge > 0 ? data.childAge + ' Tahun' : '—'}</span>
                    </div>
                    <div class="flex items-baseline gap-1">
                        <span class="text-brand-purple font-semibold w-28 shrink-0 whitespace-nowrap">Sekolah</span>
                        <span class="text-brand-purple font-black truncate min-w-0 flex-1">: ${dashIfEmpty(data.childSchool)}</span>
                    </div>
                    <div class="flex items-baseline gap-1">
                        <span class="text-brand-purple font-semibold w-28 shrink-0 whitespace-nowrap">Kelompok</span>
                        <span class="text-brand-purple font-black truncate min-w-0 flex-1">: ${dashIfEmpty(data.childGroup)}</span>
                    </div>
                </div>
            </div>

            <!-- 3. LEVEL KEGIATAN -->
            <div class="col-span-8 bg-white border-2 border-gray-200 rounded-[1.5rem] p-5 pt-6 relative mt-3">
                <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold shadow-md flex items-center gap-2 z-10">
                    <i class="fas fa-star text-brand-star text-xs"></i> LEVEL KEGIATAN
                </div>
                <div class="flex flex-col gap-2 mt-1">
                    ${stagesBlock}
                </div>
            </div>

            <!-- 4. BADGE PENCAPAIAN (compact, kolom kanan, di atas Ringkasan) -->
            <div class="col-span-8 bg-white border-2 border-brand-badge rounded-[1.25rem] p-3 pt-5 shadow-sm relative min-h-[100px] mt-3">
                <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold shadow-md flex items-center gap-2 z-10">
                    <i class="fas fa-award text-xs"></i> BADGE PENCAPAIAN
                </div>
                <div class="flex flex-wrap gap-3">
                    ${badgeHTML(data.badges)}
                </div>
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
                <div class="grid grid-cols-2 gap-3">
                    ${missionsHTML(data.missions)}
                </div>
            </div>

            <!-- 6b. PENGESAHAN + TTD -->
            <div class="col-span-6 bg-white border-2 border-gray-200 rounded-[1.25rem] p-4 pt-5 shadow-sm relative">
                <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold shadow-md flex items-center gap-2 z-10">
                    <i class="fas fa-pen text-xs"></i> PENGESAHAN
                </div>
                <div class="mt-1">
                    <p class="text-[11px] font-semibold text-gray-500 mb-0.5">Guru Fasilitator</p>
                    <p class="text-[13px] font-bold text-brand-purple mb-3">${esc(data.facilitatorName)}</p>
                    <div class="w-full h-[60px] border-2 border-dashed border-gray-300 rounded-lg bg-gray-50"></div>
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
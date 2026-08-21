import MINI_RAPORT_TAILWIND_CSS from './miniRaport.styles.css?inline'

export interface MiniRaportData {
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
  facilitatorMessage: string
  missions: string[]
  badges: { badgeName: string; badgeImageUrl?: string }[]
  facilitatorName: string
  facilitatorPhotoUrl?: string
  galleryTitle: string
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
  return Array.from({ length: 5 }, (_, i) =>
    i < rating
      ? '<i class="fas fa-star text-brand-star"></i>'
      : '<i class="fas fa-star text-gray-200"></i>'
  ).join('')
}

const STAGE_CONFIG = [
  { icon: 'fa-face-smile', bg: 'bg-green-100', text: 'text-green-600', label: 'text-brand-green' },
  { icon: 'fa-gamepad', bg: 'bg-blue-100', text: 'text-blue-500', label: 'text-blue-500' },
  { icon: 'fa-scale-balanced', bg: 'bg-orange-100', text: 'text-orange-500', label: 'text-orange-500' },
  { icon: 'fa-heart', bg: 'bg-pink-100', text: 'text-pink-500', label: 'text-pink-500' },
]

function stageRowHTML(
  stage: MiniRaportData['stages'][0],
  index: number,
  isLast: boolean
): string {
  const cfg = STAGE_CONFIG[index % STAGE_CONFIG.length]
  const iconClass = index === 0 ? `fa-regular ${cfg.icon}` : `fas ${cfg.icon}`
  const border = isLast ? '' : 'border-b border-dashed border-gray-200 pb-3'
  const kegiatan = stage.kegiatan && stage.kegiatan.length
    ? stage.kegiatan
        .slice(0, 3)
        .map(
          (k) => `
          <div class="flex items-center justify-between gap-2">
            <span class="text-[12px] font-semibold text-gray-700 truncate">${esc(k.name)}</span>
            <span class="flex gap-0.5 text-brand-star text-sm shrink-0">${starsHTML(k.starRating)}</span>
          </div>`
        )
        .join('')
    : '<p class="text-[11px] text-gray-400 italic">Belum ada kegiatan tercatat.</p>'
  return `
    <div class="${border}">
      <div class="flex items-center gap-3 mb-2">
        <div class="w-9 h-9 rounded-full ${cfg.bg} ${cfg.text} flex items-center justify-center text-xl shrink-0">
          <i class="${iconClass}"></i>
        </div>
        <div class="min-w-0">
          <div class="${cfg.label} font-bold text-[12px] leading-tight">Topik ${esc(stage.sequenceOrder)}</div>
          <div class="text-brand-purple font-black text-[14px] leading-tight truncate">${esc(stage.name)}</div>
        </div>
      </div>
      <div class="flex flex-col gap-1.5 pl-12">${kegiatan}</div>
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
        ? `<img src="${esc(b.badgeImageUrl)}" alt="${esc(b.badgeName)}" class="w-9 h-9 object-contain rounded" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';" />
           <i class="fas fa-award text-brand-badge text-2xl hidden"></i>`
        : '<i class="fas fa-award text-brand-badge text-2xl"></i>'
      return `
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-9 h-9 flex items-center justify-center shrink-0">${inner}</div>
          <span class="text-[11px] font-semibold text-gray-700 truncate">${esc(b.badgeName)}</span>
        </div>`
    })
    .join('')
  return `<div class="grid grid-cols-2 gap-x-3 gap-y-4 w-full">${items}</div>`
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

  const facilitatorAvatar = data.facilitatorPhotoUrl
    ? `<img src="${esc(data.facilitatorPhotoUrl)}" alt="${esc(data.facilitatorName)}" class="w-full h-full object-cover rounded-full" />`
    : '<span class="text-[8px] font-bold text-gray-400 text-center leading-tight">FOTO<br>FASILITATOR</span>'

  const kidversaLogo = data.kidversaLogoUrl
    ? `<img src="${esc(data.kidversaLogoUrl)}" alt="Kidversa" class="w-full h-12 object-contain" />`
    : '<div class="w-full h-12 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-[10px] font-bold text-gray-400 bg-gray-50 text-center leading-tight px-2">[ LOGO BRAND KIDVERSA ]</div>'

  const partnerLogo = data.partnerLogoUrl
    ? `<img src="${esc(data.partnerLogoUrl)}" alt="Partner" class="w-full h-12 object-contain" />`
    : '<div class="w-full h-12 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-[10px] font-bold text-gray-400 bg-gray-50 text-center leading-tight px-2">[ LOGO BRAND EDU TOURISM ]</div>'

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
        if (window.addEventListener) {
            window.addEventListener('beforeprint', __raportBeforePrint)
        } else if (window.attachEvent) {
            window.attachEvent('onbeforeprint', __raportBeforePrint)
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
                <h1 class="text-brand-purple font-black text-[1.6rem] leading-none tracking-wide mb-1">MINI RAPORT</h1>
                <h2 class="text-brand-purple font-black text-base leading-none mb-2">PENGALAMAN BELAJAR</h2>
                <div class="ribbon-container">
                    <div class="bg-brand-green text-white px-6 py-1 rounded-full font-bold text-base relative z-10 shadow-sm border border-brand-green">
                        Program Kidversa Edu-Tourism
                    </div>
                    <div class="ribbon-tail-left"></div>
                    <div class="ribbon-tail-right"></div>
                </div>
                <div class="flex items-center gap-2 mt-3 text-brand-purple font-black text-sm">
                    <i class="fa-regular fa-calendar-days text-lg text-purple-400"></i>
                    <span>${esc(data.sessionDate)}</span>
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

            <!-- 3. LEVEL KEGIATAN (diberi jarak ektra ke bawah dari section Profil Anak) -->
            <div class="col-span-8 bg-white border-[2px] border-gray-200 rounded-[1.5rem] p-4 relative pt-6 mt-3">
                <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold shadow-md flex items-center gap-2 z-10">
                    <i class="fas fa-star text-brand-star text-xs"></i> LEVEL KEGIATAN
                </div>
                <div class="flex flex-col gap-2 mt-1 overflow-hidden rounded-[1rem]">
                    ${stagesBlock}
                </div>
            </div>

            <!-- 4. PESAN FASILITATOR + TTD (kolom kanan, di atas Ringkasan) -->
            <div class="col-span-8 bg-brand-lightPurple rounded-[1.25rem] p-4 border border-purple-50 shadow-sm relative flex flex-col">
                <div class="flex items-center gap-3 mb-2">
                    <div class="w-10 h-10 rounded-full bg-white border-2 border-dashed border-gray-300 shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                        ${facilitatorAvatar}
                    </div>
                    <h4 class="font-black text-brand-purple text-[14px]">PESAN FASILITATOR</h4>
                </div>
                <p class="text-[12px] font-semibold text-brand-badge leading-relaxed flex-1 line-clamp-4">${esc(data.facilitatorMessage)}</p>
                <div class="mt-2 flex items-center gap-3 border-t border-purple-200 pt-2">
                    <div class="w-20 h-10 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-[10px] font-bold text-gray-400 bg-gray-50 relative">
                        [ TTD FASILITATOR ]
                    </div>
                    <div class="text-[12px] font-bold text-gray-600 truncate">${esc(data.facilitatorName)}</div>
                </div>
            </div>

            <!-- 5. RINGKASAN (full-width, lebih tinggi) -->
            <div class="col-span-12 bg-brand-lightGreen rounded-[1.5rem] p-3.5 shadow-sm min-h-[120px] flex flex-col">
                <h4 class="font-bold text-brand-darkGreen flex items-center gap-2 mb-1 shrink-0">
                    <i class="fas fa-star text-xs"></i> RINGKASAN
                </h4>
                <p class="text-[13px] font-semibold text-gray-800 leading-snug line-clamp-5 flex-1">${narrativeBlock(data)}</p>
            </div>

            <!-- 6a. MISI LANJUTAN -->
            <div class="col-span-6 bg-brand-yellow rounded-[1.25rem] p-4 pt-3 border border-yellow-200 shadow-sm relative">
                <div class="flex items-center gap-3 mb-3">
                    <span class="bg-orange-200 text-orange-600 w-8 h-8 rounded-xl flex items-center justify-center text-lg shadow-sm"><i class="fas fa-home"></i></span>
                    <h3 class="font-black text-brand-purple text-base">MISI LANJUTAN</h3>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    ${missionsHTML(data.missions)}
                </div>
            </div>

            <!-- 6b. BADGE PENCAPAIAN (dibuat lebih tinggi) -->
            <div class="col-span-6 bg-white border-2 border-brand-badge rounded-[1.25rem] p-4 pt-3 shadow-sm relative min-h-[190px] flex flex-col">
                <div class="flex items-center gap-3 mb-3">
                    <i class="fas fa-award text-brand-badge text-lg"></i>
                    <h3 class="font-black text-brand-purple text-[14px]">BADGE PENCAPAIAN</h3>
                </div>
                <div class="flex-1 flex items-center">
                    ${badgeHTML(data.badges)}
                </div>
            </div>
        </main>

        <!-- Footer: Copyright (kiri) | divider | QR Code Galeri (kanan) -->
        <div class="bg-[#795db2] text-white px-8 py-3 flex items-center gap-4 relative z-10 rounded-b-[2rem]">

            <!-- Kiri: Copyright -->
            <div class="flex-1 min-w-0">
                <p class="text-[11px] font-semibold opacity-95 leading-snug flex items-center gap-2">
                    <i class="fas fa-book-open text-sm opacity-90 shrink-0"></i>
                    <span>Dokumen ini merupakan laporan perkembangan pengalaman belajar anak pada Program Kidversa Edu-Tourism.</span>
                </p>
            </div>

            <!-- Divider vertikal -->
            <div class="raport-divider shrink-0"></div>

            <!-- Kanan: QR Code Galeri -->
            <div class="raport-footer-qr">
                <div class="raport-qr-caption">
                    <div class="text-[9px] font-bold text-white/70 tracking-wider truncate">${esc(data.galleryTitle)}</div>
                    <div class="text-[9px] font-semibold text-white/70 italic">Scan untuk melihat galeri</div>
                </div>
                <div class="w-14 h-14 bg-white rounded-lg flex items-center justify-center text-gray-400 text-[8px] font-bold text-center leading-tight shrink-0 shadow-sm p-1">
                    [ QR CODE ]
                </div>
            </div>
        </div>

    </div>

</body>
</html>`
}
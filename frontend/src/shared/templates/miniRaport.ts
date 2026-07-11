import MINI_RAPORT_TAILWIND_CSS from './miniRaport.styles.css?inline'
import { A4_SHEET_WIDTH } from '../../core/constants/report'

export interface MiniRaportData {
  childName: string
  childAge: number
  sessionDate: string // "14 Juni 2026" format
  photoUrl?: string // blob URL or data URL
  quote?: string // first sentence of narrative
  stages: {
    name: string
    sequenceOrder: number
    starRating: number // 0–5
  }[]
  narrative: string // full AI narrative text
  facilitatorMessage: string
  missions: string[] // selected mission titles_child
  facilitatorName: string
  facilitatorPhotoUrl?: string
  galleryUrl?: string
  partnerLogoUrl?: string
  kidversaLogoUrl?: string
}

function sanitize(str: string): string {
  return str.replace(/[\/\\:*?"<>|]/g, '_').trim()
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
  return `
    <div class="flex items-center justify-between ${border}">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-full ${cfg.bg} ${cfg.text} flex items-center justify-center text-xl">
          <i class="${iconClass}"></i>
        </div>
        <div>
          <div class="${cfg.label} font-bold text-[13px] leading-tight">Tahap ${stage.sequenceOrder}</div>
          <div class="text-brand-purple font-black text-[15px] leading-tight">${stage.name}</div>
        </div>
      </div>
      <div class="flex gap-1.5 text-brand-star text-lg">${starsHTML(stage.starRating)}</div>
    </div>`
}

function missionsHTML(missions: string[]): string {
  if (missions.length === 0)
    return '<p class="text-sm text-gray-500 italic">Belum ada misi yang dipilih.</p>'
  return missions
    .slice(0, 3)
    .map(
      (m) => `
      <div class="flex items-start gap-3">
        <i class="fas fa-square-check text-brand-green text-xl"></i>
        <p class="text-sm font-bold text-gray-700 leading-snug flex-1">${m}</p>
      </div>`
    )
    .join('')
}

export function generateMiniRaportHTML(data: MiniRaportData): string {
  const photoBlock = data.photoUrl
    ? `<img src="${data.photoUrl}" alt="${data.childName}" class="w-full h-full object-cover" />`
    : `<i class="fas fa-image text-5xl opacity-30"></i>
       <span class="font-bold text-sm tracking-widest">[ PLACEHOLDER FOTO ANAK ]</span>`

  const quoteText = data.quote || 'Hari yang menyenangkan di Kidversa!'

  const stagesBlock = data.stages.length
    ? data.stages
        .map((s, i) => stageRowHTML(s, i, i === data.stages.length - 1))
        .join('')
    : '<p class="text-sm text-gray-500 italic">Belum ada data tahapan.</p>'

  const facilitatorAvatar = data.facilitatorPhotoUrl
    ? `<img src="${data.facilitatorPhotoUrl}" alt="${data.facilitatorName}" class="w-full h-full object-cover rounded-full" />`
    : '<span class="text-[8px] font-bold text-gray-400 text-center leading-tight">FOTO<br>FASILITATOR</span>'

  const kidversaLogo = data.kidversaLogoUrl
    ? `<img src="${data.kidversaLogoUrl}" alt="Kidversa" class="w-full h-12 object-contain" />`
    : '<div class="w-full h-12 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-[10px] font-bold text-gray-400 bg-gray-50 text-center leading-tight px-2">[ LOGO BRAND KIDVERSA ]</div>'

  const partnerLogo = data.partnerLogoUrl
    ? `<img src="${data.partnerLogoUrl}" alt="Partner" class="w-full h-12 object-contain" />`
    : '<div class="w-full h-12 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-[10px] font-bold text-gray-400 bg-gray-50 text-center leading-tight px-2">[ LOGO BRAND EDU TOURISM ]</div>'

  const galleryValue = data.galleryUrl || '[ URL GALERI ]'

  return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mini Raport - ${sanitize(data.childName)} - ${data.sessionDate}</title>

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
                height: 297mm !important;
                margin: 0 !important;
                padding: 0 !important;
                display: block !important;
                background: #ffffff !important;
                overflow: hidden !important;
            }
            .a4-sheet {
                width: 210mm !important;
                max-width: 210mm !important;
                height: 297mm !important;
                max-height: 297mm !important;
                margin: 0 !important;
                overflow: hidden !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
            .a4-sheet > :last-child {
                border-radius: 0 !important;
            }
        }
    </style>

    <style>
        @media (max-width: ${A4_SHEET_WIDTH}px) {
            body {
                padding: 0 !important;
                align-items: flex-start !important;
                justify-content: center !important;
            }
            .a4-sheet {
                transform: scale(min(calc(100vw / ${A4_SHEET_WIDTH}px), 1));
                transform-origin: top center;
                margin-left: auto !important;
                margin-right: auto !important;
            }
        }
    </style>
</head>
<body class="py-10 px-4 antialiased text-brand-text flex justify-center">

    <div class="a4-sheet max-w-[${A4_SHEET_WIDTH}px] w-full bg-white rounded-[2rem] shadow-2xl relative overflow-hidden ring-1 ring-gray-200 z-10">

        <header class="flex justify-between items-start px-8 pt-5 pb-3 relative">

            <!-- Left Logo -->
            <div class="w-36 flex flex-col items-center gap-3 relative z-10 mt-2">
                ${kidversaLogo}
            </div>

            <!-- Center Title -->
            <div class="text-center flex-1 px-4 flex flex-col items-center z-20">
                <h1 class="text-brand-purple font-black text-[2rem] leading-none tracking-wide mb-1">MINI RAPORT</h1>
                <h2 class="text-brand-purple font-black text-lg leading-none mb-2">PENGALAMAN BELAJAR</h2>
                <div class="ribbon-container">
                    <div class="bg-brand-green text-white px-6 py-1 rounded-full font-bold text-lg relative z-10 shadow-sm border border-brand-green">
                        Program Kidversa Edu-Tourism
                    </div>
                    <div class="ribbon-tail-left"></div>
                    <div class="ribbon-tail-right"></div>
                </div>
                <div class="flex items-center gap-2 mt-4 text-brand-purple font-black text-base">
                    <i class="fa-regular fa-calendar-days text-xl text-purple-400"></i>
                    <span>${data.sessionDate}</span>
                </div>
            </div>

            <!-- Right Logo -->
            <div class="w-36 flex flex-col items-center gap-3 relative z-10 mt-2">
                ${partnerLogo}
            </div>

            <div class="absolute bottom-0 left-8 right-8 border-b border-gray-100"></div>
        </header>

        <main class="grid grid-cols-12 gap-5 px-8 py-3">

            <!-- LEFT COLUMN (Span 5) -->
            <div class="col-span-5 flex flex-col gap-4">

                <!-- Photo -->
                <div class="relative mt-1">
                    <div class="absolute -left-3 -top-4 z-20 bg-brand-badge text-white px-4 py-1.5 rounded-full font-bold text-[13px] shadow-md flex items-center gap-2 border-[2px] border-white">
                        <i class="fas fa-camera text-brand-star text-base"></i>
                        Momen Terbaik Hari Ini
                    </div>
                    <div class="w-full h-[200px] rounded-[1.5rem] border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col gap-2 justify-center items-center text-gray-400 relative overflow-hidden">
                        ${photoBlock}
                    </div>
                </div>

                <!-- Quote & QR Code -->
                <div class="flex flex-col flex-1 bg-brand-blue rounded-[1.5rem] p-4 gap-3 mt-2 relative border border-blue-100 shadow-sm">
                    <div class="flex items-center gap-4 border-b border-sky-100 pb-3">
                        <div class="bg-sky-400 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-md border-[2px] border-white z-10 shrink-0">
                            <i class="fas fa-comment-dots mt-0.5"></i>
                        </div>
                        <h3 class="font-black text-sky-600 text-[13px] leading-tight tracking-wide">APA YANG DIKATAKAN<br>${data.childName} HARI INI?</h3>
                    </div>

                    <div class="flex-1 flex flex-col justify-center py-2">
                        <div class="relative px-2">
                            <span class="text-5xl text-sky-700 font-serif absolute -top-4 -left-2 leading-none opacity-80">"</span>
                            <p class="font-bold text-brand-purple text-[14px] relative z-10 leading-relaxed pl-6 pr-2">${quoteText}"</p>
                        </div>
                    </div>

                    <div class="border-b-2 border-dashed border-sky-200 w-full my-2"></div>

                    <div class="w-full flex flex-col items-center justify-center gap-3 pt-2 text-center pb-2">
                        <div class="w-16 h-16 border-2 border-dashed border-gray-300 bg-white p-1 rounded-xl flex items-center justify-center text-gray-400 text-sm font-bold shadow-sm">
                            [ QR CODE ]
                        </div>
                        <p class="text-[11px] font-bold text-sky-700 leading-tight max-w-[160px]">
                            <i class="fas fa-headphones text-sky-500 mr-1"></i> Scan QR untuk mendengarkan cerita ${data.childName}.
                        </p>
                    </div>
                </div>
            </div>

            <!-- RIGHT COLUMN (Span 7) -->
            <div class="col-span-7 flex flex-col gap-4">

                <!-- Profil Anak -->
                <div class="bg-white border-[2px] border-brand-badge rounded-[1.5rem] p-4 relative pt-6 mt-1">
                    <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold shadow-md flex items-center gap-2">
                        <i class="fas fa-user text-xs"></i> PROFIL ANAK
                    </div>
                    <table class="w-full text-[13px]">
                        <tr>
                            <td class="text-brand-purple font-semibold w-28 pb-1">Nama Anak</td>
                            <td class="text-brand-purple font-black pb-1">: ${data.childName}</td>
                        </tr>
                        <tr>
                            <td class="text-brand-purple font-semibold w-28">Usia</td>
                            <td class="text-brand-purple font-black">: ${data.childAge} Tahun</td>
                        </tr>
                    </table>
                </div>

                <!-- Perkembangan Aktivitas -->
                <div class="bg-white border-[2px] border-gray-200 rounded-[1.5rem] p-4 relative pt-6">
                    <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold shadow-md flex items-center gap-2">
                        <i class="fas fa-star text-brand-star text-xs"></i> PERKEMBANGAN AKTIVITAS
                    </div>
                    <div class="flex flex-col gap-2 mt-1">
                        ${stagesBlock}
                    </div>
                </div>

                <!-- Ringkasan -->
                <div class="bg-brand-lightGreen rounded-[1.5rem] p-3.5 shadow-sm">
                    <h4 class="font-bold text-brand-darkGreen flex items-center gap-2 mb-1.5">
                        <i class="fas fa-star text-xs"></i> RINGKASAN
                    </h4>
                    <p class="text-[13px] font-semibold text-gray-800 leading-snug">${data.narrative}</p>
                </div>

                <!-- Pesan Fasilitator -->
                <div class="bg-brand-lightPurple rounded-[1.5rem] p-4 relative shadow-sm border border-purple-50 mt-2">
                    <div class="flex items-center gap-4 mb-3">
                        <div class="w-10 h-10 rounded-full bg-white border-2 border-dashed border-gray-300 shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                            ${facilitatorAvatar}
                        </div>
                        <h4 class="font-black text-brand-purple text-[14px]">PESAN FASILITATOR</h4>
                    </div>
                    <p class="text-[13px] font-semibold text-brand-badge leading-relaxed">${data.facilitatorMessage}</p>
                </div>
            </div>
        </main>

        <!-- Misi Rumah Minggu Ini -->
        <section class="mx-8 mb-4 bg-brand-yellow rounded-[1.25rem] p-4 pt-3 border border-yellow-200 shadow-sm relative">
            <div class="flex items-center gap-3 mb-4">
                <span class="bg-orange-200 text-orange-600 w-8 h-8 rounded-xl flex items-center justify-center text-lg shadow-sm"><i class="fas fa-home"></i></span>
                <h3 class="font-black text-brand-purple text-base">MISI RUMAH MINGGU INI</h3>
            </div>
            <div class="grid grid-cols-3 gap-4">
                ${missionsHTML(data.missions)}
            </div>
        </section>

        <div class="flex-1"></div>

        <!-- Footer Signatures & Info -->
        <footer class="px-8 pb-4 border-t-2 border-dashed border-gray-300 mx-8 pt-4 flex justify-between items-center relative">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-2xl bg-brand-badge text-white flex items-center justify-center text-lg shadow-md">
                    <i class="fas fa-camera"></i>
                </div>
                <div>
                    <div class="text-[10px] font-bold text-gray-500 tracking-wider">GALERI KEGIATAN:</div>
                    <div class="text-brand-badge font-black text-[13px]">${galleryValue}</div>
                </div>
            </div>

            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-lg shadow-md">
                    <i class="fas fa-user-tie"></i>
                </div>
                <div>
                    <div class="text-[10px] font-bold text-gray-500 tracking-wider">FASILITATOR:</div>
                    <div class="text-gray-800 font-black text-[13px]">${data.facilitatorName}</div>
                </div>
            </div>

            <div class="text-center relative w-40 pt-2">
                <div class="w-full h-12 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-[12px] font-bold text-gray-400 bg-gray-50 relative z-10">
                    [ TTD FASILITATOR ]
                </div>
                <div class="absolute -right-2 -top-2 text-purple-400 text-xl rotate-12 z-20"><i class="fas fa-heart"></i></div>
                <div class="w-full border-b-2 border-gray-800 mt-3"></div>
            </div>
        </footer>

        <!-- Very Bottom Bar -->
        <div class="bg-[#795db2] text-white px-8 py-3 flex items-center gap-4 relative z-10 rounded-b-[2rem]">
            <i class="fas fa-book-open text-xl opacity-90"></i>
            <p class="text-[11px] font-semibold opacity-95 leading-snug">
                Dokumen ini merupakan laporan perkembangan pengalaman belajar anak<br>pada Program Kidversa Edu-Tourism.
            </p>
        </div>

    </div>

</body>
</html>`
}

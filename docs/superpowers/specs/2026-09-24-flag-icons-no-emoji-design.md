# Desain: Ganti Emoji Bendera dengan `country-flag-icons` (Tanpa Emoji)

- **Tanggal**: 2026-09-24
- **Status**: Disetujui user (desain per-bagian OK; spesifikasi menunggu review akhir)
- **Cakupan**: Frontend saja (tanpa perubahan backend)
- **Supersedes**: bagian render flag pada `2026-09-23-frontend-multilanguage-design.md` §5 ("emoji bendera + endonym") — baris switcher kini memakai SVG, bukan emoji.

## 1. Latar Belakang & Tujuan

Emoji bendera (regional indicator) tidak tampil dengan benar di Windows — render sebagai kode huruf dua huruf (README `country-flag-icons` sendiri mengakui celah platform ini). Seluruh simbol negara di UI harus memakai ikon SVG dari `https://www.npmjs.com/package/country-flag-icons` alih-alih emoji.

Situs terdampak (hasil inventaris, terverifikasi ke file):

| # | Situs | Isi |
|---|---|---|
| 1 | `frontend/src/core/i18n/locales.ts:13-21` | 9 emoji literal (`🇮🇩 🇬🇧 🇲🇾 🇹🇭 🇵🇭 🇰🇷 🇨🇳 🇯🇵 🇻🇳`) pada field `flag` |
| 2 | `frontend/src/shared/components/ui/LanguageSwitcherModal.tsx:35` | render `l.flag` di baris pemilih bahasa |
| 3 | `frontend/src/core/utils/phone.ts:31,43-45` | generator emoji via codepoint math (`0x1f1e6`) pada `CountryOption.flag` |
| 4 | `frontend/src/shared/components/ui/PhoneInput.tsx:81-83` | `` `${c.flag} +${c.dialCode} — ${c.name}` `` di dalam `<option>` select native |
| 5 | `frontend/tests/unit/phone.test.ts:50`, `frontend/tests/unit/i18n/locales.test.ts:18-23` | test yang mem-pin emoji |

Tidak ada situs lain (inventaris menyeluruh: locale JSON, index.html, public assets, seluruh `features/` — nol emoji bendera; `EditPhoneModal` fasilitator memang tanpa country picker).

## 2. Keputusan Inti

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Library | `country-flag-icons@1.6.20` (MIT, types bawaan) | Diminta user; tree-shakeable (`sideEffects: ["*.css"]`), ~1 kB/flag, type-safe strict TS |
| Gaya import | **React component** `import { ID, GB } from 'country-flag-icons/react/3x2'` | Satu-satunya idiom icon repo (lucide: named import + Tailwind class + `aria-hidden`); gaya CSS package memaksa semua 265 flag (±196 KiB) + classname asing `flag:XX` |
| Penyuplaian 230-an flag phone | **Lazy chunk**: `import('country-flag-icons/react/3x2')` saat picker pertama dibuka, cache module-scope | Bundle awal tak terpengaruh; workbox PWA sudah memprecache js |
| 9 flag switcher | **Import statis** (peta eksplisit `Record`) | Tree-shaken ~9 kB; exhaustif di strict TS |
| Phone country picker | **Custom listbox** (ganti select native) | `<option>` native tidak bisa merender SVG — batasan browser |
| Interaksi listbox | Trigger kompak (bendera + `+kode`); panel buka → input pencarian di atas daftar | ±230 item butuh search; konsisten dengan pattern `LanguageSwitcherModal` |
| Bukti kerja | **Unit test disempurnakan** (vitest + RTL, jsdom) — tanpa smoke test UI | Keputusan user |

**Alternatif yang ditolak:**
- *CSS class style* (`flag:XX`): selalu mengirim 265 flag (±196 KiB), tanpa type-check, idiom asing.
- *Eager registry statis penuh*: sederhana tapi +±200 kB raw ke bundle awal untuk fitur sesekali.
- *`import.meta.glob` per-flag*: daftar membuka semua baris → semua flag tetap ikut load; kompleks, nol manfaat.
- *Overlay select native / select teks-only / tanpa bendera*: sudah ditawarkan, user memilih custom listbox (opsi B).

## 3. Arsitektur & Komponen

**Dependency baru**: `country-flag-icons@1.6.20` di `frontend/package.json`.
⚠️ Package **tidak** mendeklarasikan `react` sebagai peer dependency (fakta registry) — sekali saat install: smoke-check resolusi module pnpm; jika gagal, mitigasi `pnpm.overrides`/`packageExtensions` (bukan code change).

**Komponen baru — `frontend/src/shared/components/ui/FlagIcon.tsx`**

```tsx
type FlagIconProps = { iso?: string; title?: string } & React.SVGProps<SVGSVGElement> // spread svg/aria props (className, aria-hidden, …)
// render <svg> dari country-flag-icons/react/3x2
// dekoratif default: aria-hidden; jika title diberikan → role="img" + <title>
```

Dua mode resolusi di balik satu komponen:
- **Statis** — `Record<string, ComponentType>` untuk 9 kode bahasa (import statis): `ID, GB, MY, TH, PH, KR, CN, JP, VN`. Dipakai language switcher.
- **Lazy** — registry 265 component via dynamic `import()`; di-trigger saat PhoneInput picker pertama dibuka; hasil di-cache module-scope. Saat belum ready → render `null` (teks tetap tampil).

**Fallback**: ISO tak tercakup registry atau load gagal → tanpa bendera, teks `+{dialCode}` utuh; tanpa crash, tanpa emoji. Mungkin untuk kode tak-resmi libphonenumber (`AC`, `TA`, `XK`, …).

**Perubahan data — `core/i18n/locales.ts`**

```ts
interface LanguageMeta {
  code: LanguageCode
  country: string   // ISO 3166-1 alpha-2 → komponen flag (en:'GB', zh:'CN', tl:'PH')
  endonym: string
  english: string
}
```

Field `flag` (emoji) **dihapus**; peta representasi negara tetap eksplisit per bahasa (keputusan multilanguage lama; tidak dihitung otomatis). Emoji generator `phone.ts:43-45` **dihapus bersih** — `CountryOption` tinggal `{ iso, dialCode, name }`.

**Situs render:**

| Situs | Sebelum | Sesudah |
|---|---|---|
| `LanguageSwitcherModal.tsx:35` | `<span>{l.flag}</span>` | `<FlagIcon iso={l.country} className="h-4 w-6" aria-hidden>` |
| `phone.ts` `CountryOption.flag` | emoji codepoint | dihapus |
| `PhoneInput.tsx` select+option | teks-emoji | custom listbox (Bagian 4) |

## 4. PhoneInput Custom Listbox

**State tertutup (trigger)** — menggantikan `<select>` `PhoneInput.tsx:65-84`:
- Tombol `rounded-l-xl`: `FlagIcon (h-4 w-6) + "+{dialCode}"` — lebih ramping dari select lama (max-w 45% → fit-content), input telepon dapat ruang lebih.
- `aria-haspopup="listbox"`, `aria-expanded`, `aria-label={t('common.phone.countryCode')}` (key existing), `disabled`/`error` mengikuti props verbatim.

**State terbuka (panel)** — popup absolut di bawah trigger (`absolute top-full z-30`, max-height ~280px, scrollable); **bukan** `Modal` (Modal repo = dialog centered):
1. Input pencarian di atas: filter folds ke nama negara + dial code (case-insensitive).
2. Baris `role="option"`: `FlagIcon + nama (Intl.DisplayNames) + "+dialCode"`; baris terpilih dapat centang (pola `LanguageSwitcherModal:40`).
3. Lazy load: panel pertama dibuka → dynamic import registry; sementara ready baris teks-only (tetap bisa dipilih); berikutnya sinkron.
4. Empty state: `t('common.phone.emptyCountry')` (key baru).

**Interaksi**: klik trigger → buka + fokus search; klik luar / `Escape` → tutup (pola handler `Modal.tsx:28-34`); `ArrowUp/Down` navigasi, `Enter` pilih, `Tab` keluar; `role="listbox"` + `aria-activedescendant`.

**Tidak berubah**: `detectCountry`, `combinePhone`, `normalizePhone`, E.164 contract, perilaku paste internasional, props `PhoneInputProps` — 3 callsite (`ParticipantFormModal.tsx:381-384`, `ParticipantFormPage.tsx:269-272`, `UserFormPage.tsx:275-278`) tanpa perubahan.

## 5. Error Handling

- Registry lazy gagal / ISO tak tercakup → `FlagIcon` render `null`; teks `+dialCode` + nama negara tetap; `try/catch` di sekitar dynamic import; tanpa error UI.
- Loading state → teks-only dulu, tanpa spinner.
- Semua state error phone lama (`error` prop, `role="alert"`, `describedBy`) dipertahankan verbatim.

## 6. i18n Keys

- **1 key baru**: `common.phone.emptyCountry` (empty state daftar) — ditambahkan ke `id.json` lalu 8 locale lain **via generator existing** (`frontend/scripts/generate-locales.mjs` + `pnpm check:locales`), bukan manual.
- Search placeholder **tanpa key baru** → pakai `common.phone.countryCode` yang sudah ada.

## 7. Testing & Verifikasi (unit only — tanpa smoke UI)

| File | Status | Kontrak yang dibela |
|---|---|---|
| `tests/unit/phone.test.ts` | diubah | Hapus pin emoji `toBe('🇮🇩')` → assert `iso`/`dialCode` benar; contract E.164 & deteksi negara utuh; field `flag` tak ada lagi |
| `tests/unit/i18n/locales.test.ts` | diubah | Tiap entry punya `country` non-kosong berformat ISO alpha-2 uppercase; 9 entri, kode unik |
| `tests/unit/phoneInput.test.tsx` | diubah | Buka panel via trigger, filter search mempersempit daftar, pilih baris US → value `+1…`; trigger kompak menampilkan `+62` default; aria-label country-code dipertahankan |
| `tests/unit/i18n/switcher.test.tsx` | ditambah | Baris bahasa mengandung `<svg>` FlagIcon; **nol** emoji regional-indicator di DOM (sweep regex `[\u{1F1E6}-\u{1F1FF}]`, `u` flag) |
| `tests/unit/flagIcon.test.tsx` | **baru** | ISO dikenal statis → `<svg>` ter-render; ISO tak dikenal / registry belum ready → null tanpa throw; `title` → `role="img"` + `<title>` |
| 14 test lama lainnya | tak tersentuh | label/pesan Indonesia tidak berubah |

**Gerbang kelulusan**: `pnpm build` (strict `tsc -b` + Vite, memvalidasi type registry & tree-shaking) → `pnpm test:unit:run` → `pnpm test:unit:typecheck` → `pnpm check:locales`.

## 8. Out of Scope (disengaja)

- Backend apa pun.
- `Select.tsx` (select native non-phone) dibiarkan.
- `EditPhoneModal` fasilitator (tanpa country picker, memang tanpa emoji).
- Menambah/mengubah daftar bahasa atau negara; nama negara tetap `Intl.DisplayNames(['id'])` (nama selalu-Indonesia = bug lama, tidak diperluas scope).
- Smoke test UI / puppeteer (keputusan user: unit test saja).

## 9. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| `react` tak dideklarasikan sebagai peer dependency | Smoke-check resolusi sekali saat install; fallback `pnpm.overrides/packageExtensions` |
| Coverage libphonenumber vs 265 flag tak diverifikasi eksaustif | Fallback teks-only per-ISO, tanpa crash |
| Bundle awal membengkak | Statis hanya 9 flag; 265 di lazy chunk |
| Test lama mem-pin emoji | Dua test diubah kontraknya secara eksplisit (Bagian 7) |
| Spec lama `2026-09-23` menyebut "emoji bendera" | Supersedes deklarasi di header dokumen ini |

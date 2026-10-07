# ADR-001: Rapor Publik Pra-Cancel Dibekukan (Bukan Dicabut)

Tanggal: 2026-10-07
Status: diterima

## Konteks

Ketika sebuah sesi dibatalkan (CANCELLED), rapor yang sudah digenerate dan
sudah dibagikan ke orang tua via token akses publik (`GET /api/reports/access`)
berada dalam posisi ambigu: tautan sudah tersebar via WhatsApp, tetapi sesi
sumbernya tidak lagi aktif. Dua opsi dipertimbangkan:

1. **CABUT** — kembalikan 404/410 untuk rapor sesi-batal (tautan mati).
2. **BEKU** — tetap layani rapor pra-cancel sebagai arsip ber-banner.

## Keputusan

Opsi **BEKU**: `GetByAccessToken` dan `BuildPublicReportView` tetap melayani
rapor pra-cancel, tetapi respons/view membawa penanda `session_cancelled: true`
(field view/DTO baru, bukan skema DB) yang dirender halaman rapor publik
sebagai banner "sesi dibatalkan" (arsip). Opsi cabut (404/410) TIDAK
diimplementasikan.

## Alasan

- Tautan rapor sudah tersebar ke orang tua sebelum cancel; mematikan tautan
  (404/410) menghancurkan bukti perkembangan anak yang sah pada saat dibuat.
- Rapor adalah snapshot pra-cancel (narasi, nilai, badge yang sudah commit
  bertahan by-design); menyajikannya dengan banner jujur tentang status sesi
  lebih informatif daripada halaman mati.
- Perubahan terkecil: satu boolean di view + DTO + banner FE, tanpa migrasi,
  tanpa mengubah kode status endpoint (kontrak tautan stabil).

## Konsekuensi

- Klien publik harus mem-branch pada `session_cancelled` untuk banner arsip.
- Pembersihan/retensi data yatim (bila kebijakan menuntut) adalah pekerjaan
  migrasi terpisah, di luar keputusan ini.

# Design: Foto Rapor Peserta Per-Topik (Selectable in Facilitator Gallery)

- Date: 2026-09-24
- Status: Approved (brainstormed with user; all sections approved)
- Scope: fasilitator gallery photo selection per topic, photo delete, mini-rapor reflects selection (admin + parent)

## Latar Belakang (Hasil Investigasi)

Investigasi dua putaran (subagent read-only) memastikan fakta berikut:

- Galeri fasilitator ada di `SmartPhotoPage.tsx` (route `/fasilitator/groups/:groupId/children/:childId/photo`), grid `PhotoGallery.tsx`, fullscreen preview `FullscreenPhoto`, hapus via `ConfirmDialog` — preview fullscreen & hapus SUDAH berfungsi.
- "Foto rapor" = `smart_photos.is_report_photo` (boolean, unik per participant+session saat ini), hanya bisa di-set saat capture via checkbox `PhotoEditor` (`useSmartPhotos.uploadPhoto` + clear loop manual `PUT`). Endpoint backend `POST /api/photos/:id/set-report-photo` ada tapi tidak pernah dipakai frontend. `PUT /api/photos/:id` dan upload bisa men-set flag langsung tanpa clear sibling (pelanggar eksklusivitas).
- Topik = `program_stage_id` (entity `ProgramStage`; tidak ada entity Topic terpisah). `Report` = 1 (session, participant, topic) — `reports.program_stage_id` nullable. `ReportReviewPage` pakai tab topik in-page; `MiniRaportData` punya `topicName` + satu slot `photoUrl`. Satu parent token = satu report baris (satu topik).
- `smart_photos` TIDAK punya dimensi topik; boolean tunggal tidak bisa mewakili "foto berbeda per topik" / "satu foto untuk banyak topik".
- `useReportReview` hari ini resolve foto SESSiON-wide, topic-blind (`partPhotos.find(...is_report_photo)`), photo yang sama untuk semua tab.
- Parent mini-raport (`parent/ReportPage`) hardcoded `photoUrl: undefined` (anti-IDOR). `GET /api/reports/access?token=64hex` (publik, RateLimit 30) membangun `PublicReportDTO` di satu titik (`report_handler.go:69`). Belum ada endpoint penyaji byte ber-token; semua byte photo di balik JWT `/api/media`.
- `PhotoHandler.Delete` hari ini TIDAK melakukan cek tenant. Media consent gate ada di `media_handler.Get` dan `upload_handler` saja.

## Goals

1. Pilih/ganti foto rapor **per topik** langsung dari galeri fasilitator (topik dipilih dari topik yang tersedia pada program sesi).
2. Bisa pilih foto yang sama untuk beberapa topik, atau foto berbeda per topik.
3. Hapus setiap foto dari galeri (per-tile + fullscreen, dua pintu satu jalur).
4. Mini rapor ADMIN dan MINI-RAPORT PARENT langsung mencerminkan pilihan per topik.

## Non-Goals

- Tidak mengubah route/URL galeri.
- Tidak menampilkan foto di galeri token parent di luar badge yang sudah ada.
- Tidak migrasi/backfill data lama (fallback mempertahankan perilaku lama).
- Tidak menghapus kolom `is_report_photo` (tetap sebagai default/fallback).

## Section 1 — Data Model & Storage

Tabel baru `report_photo_picks` (migrasi `000004_report_photo_picks.up.sql` / `.down.sql`, mengikuti pola migrasi 000001..000003):

```sql
CREATE TABLE IF NOT EXISTS `report_photo_picks` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `photo_id` char(36) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_photo_pick` (`participant_id`, `session_id`, `program_stage_id`),
  CONSTRAINT `fk_picks_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_picks_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_picks_photo` FOREIGN KEY (`photo_id`) REFERENCES `smart_photos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- 1 baris = 1 pilihan foto untuk 1 peserta di 1 topik (topik = `program_stage_id`, literal id tanpa FK — mirrors `reports.program_stage_id`).
- Foto sama untuk banyak topik = banyak baris menunjuk `photo_id` sama; berbeda topik = baris berbeda. Unique key menjamin tepat satu foto per (participant, session, topic); upsert = pilihan terakhir menang.
- Bukan kolom di `reports`: facilitator memilih sebelum report digenerate; pilihan tidak boleh memaksa pembuatan report draft.
- Bukan boolean baru di `smart_photos`: satu foto bisa melayani banyak topik.
- **Fallback**: `smart_photos.is_report_photo` TETAP ada dan TIDAK di-backfill; topik tanpa baris di `report_photo_picks` memakai `is_report_photo` (perilaku hari ini utuh untuk data lama).
- Resolusi baca JOIN `smart_photos` dengan `deleted_at IS NULL` — foto terhapus otomatis gugur; tidak ada referensi rusak.
- `is_report_photo` berhenti ditulis dari pilihan galeri per-topik; tetap ditulis capture-time (default).

## Section 2 — Backend API

Endpoint baru (JWTAuth + TenantScope, tanpa RequireRole — konsisten route photo lain), didaftarkan di `router_photos.go`:

1. `PUT /api/photos/report-pick`
   Body: `{ "participant_id", "session_id", "program_stage_id", "photo_id" }`.
   Validasi: photo exist + tenant-scoped via `GetPhotoByID`; `photo.participant_id`/`photo.session_id` cocok dengan body (tidak → 400 `validation_error`); photo soft-deleted → 404. Upsert `report_photo_picks`. Response 200 `dto.PhotoResponse`.
2. `DELETE /api/photos/report-pick?participant_id=&session_id=&program_stage_id=` — batalkan pilihan per topik (resolusi kembali ke fallback `is_report_photo`). Response 204.
3. `GET /api/photos/report-picks?participant_id=&session_id=` — semua pilihan peserta dalam sesi. Response: array `{ program_stage_id, photo_id }`.

Read-path changes:

4. `GET /api/reports/gallery` (token galeri): `GalleryPhotoDTO` mendapat field `report_photo: boolean` — dihitung backend: foto adalah pilihan untuk topik report token ini (via `report_photo_picks`) ATAU fallback `is_report_photo`.
5. `GET /api/reports/access`: `PublicReportDTO` mendapat `photo_url string` (`omitempty`) — resolusi: pilihan `report_photo_picks` untuk (participant, session, report.program_stage_id) → fallback `is_report_photo` → kosong. Field hanya diisi bila foto benar-benar ada (JOIN `deleted_at IS NULL`) AND consent `ConsentPhoto` granted — sehingga parent tak pernah menerima `src` rusak.
6. Endpoint byte baru `GET /api/reports/access/photo?token=`:
   - Validasi token identik `GetByAccessToken` (regex 64hex; 404 `token_invalid`; 403 `token_expired`) + `RateLimit(30)`.
   - Consent gate real-time: `GetConsentValue(participant, session, ConsentPhoto)` → belum granted → 403 `consent_required`.
   - Resolve foto (pilihan topik report → fallback) → `c.Blob(...)` seperti `media_handler.Get`. Tidak ada foto → 404.

Perubahan konsistensi (dalam scope karena menyentuh jalur yang sama):

- `PUT /api/photos/:id`: buang `is_report_photo` dari `dto.PhotoRequest` dan whitelist handler — flag lama hanya ditulis capture-time upload; eksklusivitas flag lama tak bisa dilanggar lagi.
- `PhotoHandler.Delete`: tambahkan cek tenant via `GetPhotoByID(id, tenant)` sebelum `DeletePhoto` (hari ini tidak ada cek tenant). Baris `report_photo_picks` gugur via CASCADE/resolusi `deleted_at IS NULL`.
- Upload tetap menerima `is_report_photo` (capture flow men-set default).

Migration: `backend/migrations/000004_report_photo_picks.up.sql` + `.down.sql`.

## Section 3 — Frontend Galeri Fasilitator

Lokasi: modal galeri di `SmartPhotoPage` — tanpa perubahan route (topik dipilih di dalam galeri).

1. **Pemilih topik di header galeri**: pills/tab horizontal di atas grid dari `sessionService.getStages(sessionId)` → `SessionStage[]`, nama via `programService.getStages(program_id)` (pola `nameById` di `useReportReview`). Default = topik current grup (`group.current_session_stage_id` → `program_stage_id`, pola `useChildAssessment`), fallback stage pertama. Klik topik → `activeStageId` berubah → state terpilih di tile dihitung ulang. Sesi 1 topik tetap tampil 1 pill (tanpa special-case).
2. **Aksi per tile**: dua tombol overlay hover di pojok kiri bawah (di atas hover-dim yang ada):
   - ✓ Pilih: `PUT /api/photos/report-pick` untuk (participant, session, activeStageId) → update state picks → tile langsung menandai terpilih. Sudah terpilih untuk topik ini → tombol jadi "batal" → `DELETE report-pick` (toggle).
   - 🗑 Hapus: `ConfirmDialog` yang sudah ada (pola `SmartPhotoPage:474–491`) → `photoService.delete` → reload photos + picks.
   - Klik tile tetap membuka `FullscreenPhoto` (preview tak diubah; tombol hapus di dalamnya tetap ada).
3. **State terpilih di tile**: terpilih untuk topik aktif → `border-primary ring-2` + check badge (pola `FramePicker`), menggantikan posisi badge Award. Fallback: topik aktif belum punya pick tapi foto `is_report_photo=true` → badge "default" (Award kecil gaya sekarang); klik Pilih mengonversinya jadi pick eksklusit. Footer modal: "Foto rapor untuk: [Topik aktif]" + jumlah foto.
4. **State management**: `useSmartPhotos` diperluas: `picks: {program_stage_id, photo_id}[]`, `loadPicks()`, `setPick(stageId, photoId)`, `clearPick(stageId)` — memanggil 3 endpoint baru via `photoService` (interface `PhotoService` + `API_ROUTES.PHOTOS` keys). Consent mengikat: `!participant.consent_photo` → tombol Pilih disabled.
5. **i18n MANUAL** (jangan pakai generator): key baru diketik langsung ke `frontend/src/locales/en.json` dan `id.json` saja (bahasa UI utama); bahasa lain hanya bila diminta user — tetap manual.

## Section 4 — Konsumen: Admin Review & Mini Rapor

1. **Admin `useReportReview`**: tambah fetch `photoService.getReportPicks(participantId, sessionId)` sekali bersama `photoService.getBySession`. Resolusi per tab topik: pick eksplisit `activeTopicId` → fallback `is_report_photo` (scope session) → `null`. `photo` berubah dari state statis menjadi derived dari `activeTopicId` + picks — ganti tab ⇒ foto, thumbnail header, blok sent-summary, warning `noPhotoPicked`, dan `photoUrl` `buildRaportHtml` langsung berubah. Ganti tab tanpa refetch (picks + photos di memori). Placeholder tetap bila `null`.
2. **Parent `ReportPage`**: ganti `photoUrl: undefined` hardcoded → dari payload `photo_url`; bila ada, `photoUrl` = `/api/reports/access/photo?token=<token dari useParentToken().token>` (token tidak pernah ada di DTO — hanya dipaksa masuk saat membangun URL client-side; anti-leak). Tanpa JS `onerror` tambahan; kasus tak ada foto = `photo_url` kosong → placeholder seperti sekarang.
3. **Parent `GalleryPage`**: badge "Rapor" tetap; frontend ganti pembacaan `photo.is_report_photo` → `photo.report_photo` (type `GalleryPhoto` di-update). Tampilan tak berubah.

## Section 5 — Hapus Foto, Edge Cases, Error Handling & Testing

1. **Hapus foto**: dua pintu (tombol 🗑 per-tile dan tombol `FullscreenPhoto`) → satu `ConfirmDialog` `SmartPhotoPage` → `photoService.delete(id)` → reload photos + picks bersamaan. Foto terhapus = pilihan topik aktif → tile kembali "belum ada pilihan"; admin review menampilkan `noPhotoPicked` + placeholder sampai pilih ulang. Tidak ada state menunjuk foto mati.
2. **Edge cases**:
   - Pilih foto lintas-session → 400 `validation_error`.
   - Race dua fasilitator topik sama → unique key + upsert, pilihan terakhir menang; UI reload dari server response (tanpa optimistic conflict).
   - Topik belum punya report → pilihan tetap tersimpan; saat report digenerate foto langsung terbaca.
   - Peserta dipindah session (`LinkParticipant`) → picks & foto tetap terikat sesi lama; tanpa perilaku khusus.
   - Consent dicabut → endpoint byte parent 403 real-time; galeri admin/fasilitator tetap (aturan hari ini).
   - `PUT /api/photos/:id` tak lagi menerima `is_report_photo` (dual-writer dihilangkan).
3. **Error handling**: envelope + `MessageForCode` yang ada; kode `validation_error` (400), `not_found` (404), `forbidden` (403), `consent_required` (403). FE: kegagalan `setPick/clearPick` → toast `useGlobalToast` (pola `deleteError`), state tidak diubah optimis; hapus gagal → toast `fasilitator.photos.deleteError`.
4. **Testing — UNIT TEST SAJA, tanpa smoke test** (keputusan user):
   - Buat unit test BARU di `backend/tests/` bila belum ada (pola fake repo in-memory `domain/repository`, Go `testing` murni, tanpa DB/HTTP — ikuti `assessment_test.go`/`users_usecase_test.go`): resolusi pilihan (pick → fallback `is_report_photo` → null), validasi photo cocok participant/session (400), upsert unique-key (pilihan terakhir menang), tenant check pada delete foto.
   - Tidak ada smoke test / script manual / verifikasi UI terpisah.
   - Gates tetap wajib: `gofmt -l .` (kosong), `go vet ./...`, `go build ./...`, `go test ./...`, `pnpm build`.

## Dampak File (untuk perencanaan implementasi)

- Backend: `migrations/000004_*`, `domain/entity` (picks model), `domain/repository/photo.go` (interface picks), `persistence/photo_repo.go` + model baru, `handler/router_photos.go`, `handler/photo_handler.go` (report-pick routes + delete tenant check + PUT DTO cleanup), `handler/gallery_handler.go`, `handler/report_handler.go` (+ route access/photo), `dto/photo.go`, `dto/gallery.go`, `dto/report.go`, `usecase/reports` (resolusi untuk DTO bila diperlukan).
- Frontend: `SmartPhotoPage.tsx`, `PhotoGallery.tsx`, `useSmartPhotos.ts`, `core/services/photos.ts` + `types.ts` (PhotoService), `core/constants/apiRoutes.ts`, `useReportReview.ts`, `parent/ReportPage.tsx`, `core/types/gallery.ts`, `core/types/publicReport.ts`, locale `en.json`/`id.json` (manual).

## Referensi Investigasi

Laporan investigasi lengkap tersimpan sebagai artefak subagent: `agent://ExploreFrontendGallery` (3 putaran) dan `agent://ExploreBackendPassportMedia` (4 putaran).

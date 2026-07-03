# Functional Specification Document
## Kidversa Edutourism

| | |
|---|---|
| **Nama Dokumen** | Functional Specification Document — Kidversa Edutourism |
| **Versi** | v1.0 |
| **Tanggal** | Juni 2026 |
| **Status** | Draft — Internal Review |
| **Referensi** | BRD v3.0 — Kidversa Edutourism |
| **Penyusun** | Tim Product & Engineering |

---

## Daftar Isi

1. [Tujuan & Ruang Lingkup](#1-tujuan--ruang-lingkup)
2. [Konvensi Dokumen](#2-konvensi-dokumen)
3. [Arsitektur Sistem & Alur Data](#3-arsitektur-sistem--alur-data)
4. [Database Schema (ERD Overview)](#4-database-schema-erd-overview)
5. [Modul M-01 — Program Manager](#5-modul-m-01--program-manager)
6. [Modul M-02 — Session Manager](#6-modul-m-02--session-manager)
7. [Modul M-03 — Stage Engine](#7-modul-m-03--stage-engine)
8. [Modul M-04 — Learner Interface](#8-modul-m-04--learner-interface)
9. [Modul M-05 — Fasilitator Module](#9-modul-m-05--fasilitator-module)
10. [Modul M-06 — Smart Photo Module](#10-modul-m-06--smart-photo-module)
11. [Modul M-07 — Recording Service](#11-modul-m-07--recording-service)
12. [Modul M-08 — Reflection Analyzer](#12-modul-m-08--reflection-analyzer)
13. [Modul M-09 — Assessment Module](#13-modul-m-09--assessment-module)
14. [Modul M-10 — Raport Engine](#14-modul-m-10--raport-engine)
15. [Modul M-11 — Misi Engine](#15-modul-m-11--misi-engine)
16. [Modul M-12 — Frame Manager](#16-modul-m-12--frame-manager)
17. [Modul M-13 — Content Manager](#17-modul-m-13--content-manager)
18. [Modul M-14 — Auth & Tenant](#18-modul-m-14--auth--tenant)
19. [Modul M-15 — Consent & Privacy](#19-modul-m-15--consent--privacy)
20. [Modul M-16 — Sync Engine](#20-modul-m-16--sync-engine)
21. [Modul M-17 — Notification Service](#21-modul-m-17--notification-service)
22. [Modul M-18 — Reporting & Analytics](#22-modul-m-18--reporting--analytics)
23. [API Reference — Endpoint Summary](#23-api-reference--endpoint-summary)
24. [PWA & Offline Specification](#24-pwa--offline-specification)
25. [Traceability Matrix — BRD v3 ke FSD](#25-traceability-matrix--brd-v3-ke-fsd)

---

## 1. Tujuan & Ruang Lingkup

### 1.1 Tujuan Dokumen

FSD ini menjabarkan **spesifikasi fungsional teknis** dari setiap modul sistem Kidversa Edutourism — mencakup alur layar (screen flow), business rules, API contract, dan validasi data. Dokumen ini menjadi acuan utama tim engineering dalam implementasi.

### 1.2 Ruang Lingkup

FSD ini mencakup seluruh 18 modul yang didefinisikan dalam BRD v3.0, terdistribusi di tiga antarmuka:

| Antarmuka | Target | Stack |
|---|---|---|
| **Kidversa Web** | Admin Wisata, Koordinator, Learner Interface | Next.js 14, Tailwind CSS |
| **Kidversa Mobile** | Fasilitator per stage | Next.js 14 PWA, Android-first |
| **Kidversa Parent** | Orang tua / wali | Next.js 14 PWA / mobile web |

### 1.3 Di Luar Ruang Lingkup FSD Ini

- Desain visual detail (mockup hi-fidelity) — dikerjakan terpisah oleh tim UI/UX
- Konfigurasi infrastruktur cloud (Terraform, CI/CD pipeline)
- Panduan onboarding fasilitator dan admin

---

## 2. Konvensi Dokumen

### 2.1 Konvensi Penamaan

| Entitas | Format | Contoh |
|---|---|---|
| Tabel DB | `snake_case` | `program_stages`, `session_groups` |
| API Endpoint | `kebab-case` | `/api/v1/session-groups` |
| Komponen UI | `PascalCase` | `StarRatingInput`, `PhotoFramePicker` |
| Konstanta | `UPPER_SNAKE` | `MAX_RECORDING_SECONDS` |

### 2.2 Kode Status API

| Kode | Makna |
|---|---|
| `200` | Berhasil |
| `201` | Berhasil dibuat |
| `400` | Input tidak valid |
| `401` | Tidak terautentikasi |
| `403` | Tidak punya akses |
| `404` | Data tidak ditemukan |
| `409` | Konflik data |
| `500` | Error server |

### 2.3 Tingkat Prioritas Fitur

- **P0** — Blocker: sistem tidak bisa berjalan tanpa fitur ini
- **P1** — Inti: fitur utama yang harus ada di launch
- **P2** — Penting: dapat diluncurkan tanpa ini tapi segera setelah launch
- **P3** — Nice-to-have: roadmap masa depan

---

## 3. Arsitektur Sistem & Alur Data

### 3.1 Diagram Alur Sistem

```
┌──────────────────────────────────────────────────────────────┐
│                      KIDVERSA WEB                            │
│  [Program Manager] [Session Manager] [Live Monitor]          │
│  [Content Manager] [Frame Manager]   [Raport Manager]        │
│  [Recording Review][Analytics]       [Learner Interface]     │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTPS REST API
┌──────────────────────── │ ──────────────────────────────────┐
│                  KIDVERSA MOBILE (PWA)                       │
│  [Dashboard] [Daftar Anak] [Entry Nilai]                     │
│  [Smart Photo] [Recording] [Stage Control]                   │
│  Service Worker + IndexedDB (offline layer)                  │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTPS REST API
┌──────────────────────── │ ──────────────────────────────────┐
│                  KIDVERSA PARENT (PWA)                       │
│  [Consent] [Raport] [Smart Photo] [Misi]                     │
└─────────────────────────┬────────────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │   NESTJS API SERVER   │
              │   (Cloud atau Edge)   │
              ├───────────────────────┤
              │ Auth · Stage Engine   │
              │ Assessment · Raport   │
              │ Sync Engine · Notify  │
              └───────────┬───────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
         MySQL          MinIO      Claude API
        (Database)    (Storage)   (AI Narasi)
```

### 3.2 Alur Data Utama

#### Alur Sesi Hari-H (Happy Path)

```
1. Admin setup program & sesi (H-sebelumnya)
2. Fasilitator install Kidversa Mobile PWA
3. Fasilitator login → sesi dimuat ke cache (offline prep)
4. Sesi dimulai → Stage Engine aktif
5. Kelompok masuk pos → Fasilitator buka Kidversa Mobile
6. Fasilitator jalankan konten (via Learner Interface di monitor)
7. Fasilitator input nilai, foto, rekam refleksi
8. Kelompok selesai → Fasilitator tandai selesai
9. Koordinator konfirmasi → kelompok pindah ke pos berikutnya
10. Ulangi langkah 5–9 untuk semua stage
11. Sesi selesai → Sync Engine upload semua data ke cloud
12. Koordinator review narasi AI → approve
13. Raport PDF digenerate → dikirim ke orang tua via WhatsApp/email
```

#### Alur Offline → Sync

```
Device tidak bisa ping cloud (timeout 10 detik)
        ↓
Auto-switch ke Edge Mode (mini PC lokal)
        ↓
Semua operasi berjalan di mini PC
        ↓
Koneksi internet pulih
        ↓
Sync Engine deteksi → mulai upload queue
        ↓
DB rows → foto → video (background, bertahap)
        ↓
Cloud verifikasi checksum → konfirmasi sync
        ↓
Mini PC tandai data sebagai "synced"
```

---

## 4. Database Schema (ERD Overview)

### 4.1 Tabel Utama

```sql
-- Multi-tenant
tenants (id, name, slug, settings_json, created_at)

-- Auth
users (id, tenant_id, email, password_hash, role, name, phone, created_at)
-- role: SUPER_ADMIN | ADMIN_WISATA | KOORDINATOR | FASILITATOR

-- Program & Stage
programs (id, tenant_id, name, description, is_active, created_at)
program_stages (id, program_id, sequence_order, name, description,
                content_type, duration_minutes, is_recording_stage,
                is_photo_stage, created_at)
-- content_type: VIDEO | SLIDESHOW | GAME | MIXED

-- Konten
stage_contents (id, program_stage_id, title, file_url, file_type,
                duration_seconds, sort_order, created_at)
-- file_type: VIDEO | IMAGE | AUDIO | GAME_BUNDLE

-- Frame Smart Photo
photo_frames (id, tenant_id, program_id, name, file_url,
              thumbnail_url, is_active, created_at)

-- Sesi & Kelompok
sessions (id, tenant_id, program_id, name, session_date,
          location, status, created_by, created_at)
-- status: DRAFT | ACTIVE | COMPLETED | CANCELLED

session_stages (id, session_id, program_stage_id, fasilitator_id,
                status, started_at, completed_at)
-- status: WAITING | ACTIVE | COMPLETED

session_groups (id, session_id, name, status, current_stage_id,
                created_at)
-- status: WAITING | IN_PROGRESS | COMPLETED

group_stage_progress (id, group_id, session_stage_id, status,
                      entered_at, completed_at, unlocked_by)
-- status: LOCKED | UNLOCKED | IN_PROGRESS | COMPLETED

-- Peserta
participants (id, session_id, group_id, child_name, child_age,
              school_name, parent_name, parent_phone, parent_email,
              consent_recording, consent_photo, consent_at, created_at)

-- Penilaian
assessments (id, participant_id, session_stage_id, star_rating,
             comment, assessed_by, assessed_at, updated_at)
-- star_rating: 1 | 2 | 3 | 4 | 5

-- Smart Photo
smart_photos (id, participant_id, session_id, frame_id,
              original_file_url, framed_file_url, is_report_photo,
              taken_by, taken_at, sync_status)
-- sync_status: LOCAL | SYNCED | FAILED

-- Recording
recordings (id, participant_id, session_stage_id, file_url,
            duration_seconds, file_size_bytes, transcript_text,
            emotion_tags_json, review_status, reviewed_by,
            reviewed_at, sync_status, created_at)
-- review_status: PENDING | REVIEWED | SKIPPED
-- sync_status: LOCAL | UPLOADING | SYNCED | FAILED
-- emotion_tags_json: {"primary":"antusias","secondary":"ragu","confidence":0.87}

-- Raport
reports (id, participant_id, session_id, ai_narrative_draft,
         ai_narrative_final, mission_ids_json, report_pdf_url,
         status, generated_at, sent_at, approved_by)
-- status: DRAFT | PENDING_REVIEW | APPROVED | SENT

-- Misi
mission_banks (id, program_id, category, title_child, title_parent,
               description_parent, is_active, created_at)
-- category: HOME | PARENT | SCHOOL

participant_missions (id, participant_id, report_id, mission_bank_id,
                      is_completed, completed_at)

-- Consent Log
consent_logs (id, participant_id, consent_type, value, sent_at,
              responded_at, ip_address)
-- consent_type: RECORDING | PHOTO

-- Audit Log
audit_logs (id, user_id, action, resource_type, resource_id,
            ip_address, user_agent, created_at)

-- Sync
sync_queue (id, tenant_id, source_device_id, data_type, resource_id,
            status, retry_count, created_at, synced_at)
-- data_type: ASSESSMENT | PHOTO | RECORDING | PROGRESS
-- status: PENDING | IN_PROGRESS | DONE | FAILED
```

### 4.2 Relasi Utama

```
tenants ──< users
tenants ──< programs
programs ──< program_stages ──< stage_contents
programs ──< photo_frames
programs ──< mission_banks

sessions >── programs
sessions ──< session_stages >── program_stages
sessions ──< session_groups ──< group_stage_progress
sessions ──< participants

participants >── session_groups
participants ──< assessments >── session_stages
participants ──< smart_photos >── photo_frames
participants ──< recordings >── session_stages
participants ──< reports
participants ──< participant_missions >── mission_banks
participants ──< consent_logs
```

---

## 5. Modul M-01 — Program Manager

**Antarmuka**: Kidversa Web
**Aktor**: Admin Wisata, Super Admin
**Prioritas**: P0

### 5.1 Deskripsi

Program Manager memungkinkan Admin Wisata mendefinisikan program Edu Wisata — termasuk jumlah stage, nama, tujuan, dan tipe konten setiap stage. Satu tenant dapat memiliki banyak program aktif.

### 5.2 Screen Flow

```
[Daftar Program]
    ├─ Tombol "Buat Program Baru" → [Form Buat Program]
    ├─ Klik nama program → [Detail Program]
    │       ├─ Tab "Info Program" → [Edit Info]
    │       ├─ Tab "Stage" → [Kelola Stage]
    │       │       ├─ Tambah Stage → [Form Stage]
    │       │       ├─ Drag-reorder stage → auto-save urutan
    │       │       └─ Klik stage → [Detail Stage]
    │       │               ├─ Edit info stage
    │       │               └─ Ke Content Manager (M-13)
    │       └─ Tab "Frame" → ke Frame Manager (M-12)
    └─ Nonaktifkan program → konfirmasi dialog
```

### 5.3 Form Buat / Edit Program

| Field | Tipe | Validasi | Keterangan |
|---|---|---|---|
| `name` | Text | Required, max 100 char | Nama program, misal "Belajar Bertani" |
| `description` | Textarea | Optional, max 500 char | Deskripsi singkat untuk Backoffice |
| `thumbnail_url` | Image upload | Optional, max 2MB, JPG/PNG | Gambar identitas program |
| `is_active` | Toggle | Default: true | Nonaktif = tidak bisa dibuat sesi baru |

### 5.4 Form Buat / Edit Stage

| Field | Tipe | Validasi | Keterangan |
|---|---|---|---|
| `name` | Text | Required, max 80 char | Nama stage, misal "Sapa Profesi" |
| `description` | Textarea | Optional, max 300 char | Tujuan pedagogis stage ini |
| `sequence_order` | Integer | Auto dari posisi drag | Urutan stage dalam program |
| `content_type` | Select | Required | VIDEO \| SLIDESHOW \| GAME \| MIXED |
| `duration_minutes` | Integer | Required, min 1, max 60 | Durasi maksimal (default: 12) |
| `is_recording_stage` | Toggle | Default: false | Aktifkan fitur recording di stage ini |
| `is_photo_stage` | Toggle | Default: true | Aktifkan Smart Photo di stage ini |

### 5.5 Business Rules

- **BR-P01**: Program yang sudah memiliki sesi `ACTIVE` atau `COMPLETED` tidak dapat dihapus — hanya bisa dinonaktifkan.
- **BR-P02**: Perubahan stage (nama, urutan) pada program hanya berlaku untuk sesi yang dibuat setelah perubahan. Sesi yang sudah ada tidak terpengaruh.
- **BR-P03**: Minimal 1 stage per program.
- **BR-P04**: `sequence_order` di-recalculate otomatis saat stage di-drag-reorder (1, 2, 3, ...).

### 5.6 API Endpoints

```
GET    /api/v1/programs                     # List program (tenant scope)
POST   /api/v1/programs                     # Buat program baru
GET    /api/v1/programs/:id                 # Detail program + stages
PUT    /api/v1/programs/:id                 # Update info program
DELETE /api/v1/programs/:id                 # Hapus (hanya jika tidak ada sesi)
PATCH  /api/v1/programs/:id/toggle-active   # Aktif/nonaktif

GET    /api/v1/programs/:id/stages          # List stage program
POST   /api/v1/programs/:id/stages          # Tambah stage
PUT    /api/v1/programs/:id/stages/:sid     # Edit stage
DELETE /api/v1/programs/:id/stages/:sid     # Hapus stage
PATCH  /api/v1/programs/:id/stages/reorder  # Update sequence_order
```

---

## 6. Modul M-02 — Session Manager

**Antarmuka**: Kidversa Web
**Aktor**: Admin Wisata, Koordinator
**Prioritas**: P0

### 6.1 Deskripsi

Session Manager mengelola sesi Edu Wisata — dari pembuatan, assignment fasilitator per stage, registrasi peserta dan kelompok, hingga monitoring status sesi aktif.

### 6.2 Screen Flow

```
[Daftar Sesi]
    ├─ Tombol "Buat Sesi" → [Form Buat Sesi]
    └─ Klik sesi → [Detail Sesi]
            ├─ Tab "Info" → [Edit Info Sesi]
            ├─ Tab "Stage & Fasilitator"
            │       └─ Assign fasilitator per stage
            ├─ Tab "Kelompok & Peserta"
            │       ├─ Tambah kelompok → [Form Kelompok]
            │       └─ Tambah peserta ke kelompok → [Form Peserta]
            ├─ Tab "Consent" → status consent per peserta
            ├─ Tab "Live Monitor" → ke M-03 Stage Engine
            └─ Tombol "Mulai Sesi" / "Selesaikan Sesi"
```

### 6.3 Form Buat Sesi

| Field | Tipe | Validasi | Keterangan |
|---|---|---|---|
| `program_id` | Select | Required | Pilih program |
| `name` | Text | Required, max 100 | Nama sesi, misal "Kunjungan SD Matahari" |
| `session_date` | Date | Required, tidak boleh masa lalu | Tanggal pelaksanaan |
| `location` | Text | Required, max 200 | Nama/alamat lokasi wisata |
| `notes` | Textarea | Optional | Catatan internal |

### 6.4 Form Peserta

| Field | Tipe | Validasi | Keterangan |
|---|---|---|---|
| `child_name` | Text | Required, max 100 | Nama lengkap anak |
| `child_age` | Integer | Required, min 4, max 10 | Usia anak dalam tahun |
| `school_name` | Text | Optional, max 100 | Asal sekolah/lembaga |
| `parent_name` | Text | Required, max 100 | Nama orang tua/wali |
| `parent_phone` | Phone | Required, format Indonesia | Nomor WhatsApp orang tua |
| `parent_email` | Email | Optional | Email orang tua (untuk raport) |
| `group_id` | Select | Required | Assign ke kelompok |

### 6.5 Business Rules

- **BR-S01**: Sesi hanya bisa dimulai (`ACTIVE`) jika semua stage sudah di-assign fasilitator.
- **BR-S02**: Sesi `ACTIVE` tidak dapat diedit info utamanya — hanya catatan yang boleh diubah.
- **BR-S03**: Peserta dapat dipindah ke kelompok lain selama sesi belum `ACTIVE`.
- **BR-S04**: Jika peserta ditambahkan setelah sesi `ACTIVE`, koordinator dapat unlock secara manual.
- **BR-S05**: Sesi dapat `COMPLETED` hanya jika semua kelompok sudah `COMPLETED`.
- **BR-S06**: Import peserta bulk via CSV tersedia — format: `child_name, child_age, school_name, parent_name, parent_phone, parent_email, group_name`.

### 6.6 API Endpoints

```
GET    /api/v1/sessions                           # List sesi
POST   /api/v1/sessions                           # Buat sesi
GET    /api/v1/sessions/:id                       # Detail sesi
PUT    /api/v1/sessions/:id                       # Update sesi
PATCH  /api/v1/sessions/:id/start                 # Mulai sesi
PATCH  /api/v1/sessions/:id/complete              # Selesaikan sesi

GET    /api/v1/sessions/:id/stages                # Stage + fasilitator
PUT    /api/v1/sessions/:id/stages/:ssid/assign   # Assign fasilitator

GET    /api/v1/sessions/:id/groups                # List kelompok
POST   /api/v1/sessions/:id/groups                # Buat kelompok
PUT    /api/v1/sessions/:id/groups/:gid           # Edit kelompok

GET    /api/v1/sessions/:id/participants          # List peserta
POST   /api/v1/sessions/:id/participants          # Tambah peserta
POST   /api/v1/sessions/:id/participants/import   # Import CSV
PUT    /api/v1/sessions/:id/participants/:pid     # Edit peserta
```

---

## 7. Modul M-03 — Stage Engine

**Antarmuka**: Kidversa Web (koordinator), Kidversa Mobile (fasilitator)
**Aktor**: Koordinator, Fasilitator
**Prioritas**: P0

### 7.1 Deskripsi

Stage Engine mengelola logika perpindahan kelompok antar stage — sequential dan non-sequential. Komunikasi menggunakan **polling** (bukan WebSocket) untuk keandalan di jaringan lokal.

### 7.2 State Machine Kelompok

```
WAITING ──► UNLOCKED ──► IN_PROGRESS ──► COMPLETED
              │                               │
              └── (manual unlock oleh koord.) │
                                              ▼
                                    [Kelompok siap ke stage berikutnya]
```

### 7.3 Alur Sequential (Default)

```
Fasilitator tap "Kelompok Selesai" di Kidversa Mobile
        ↓
POST /api/v1/stage-progress/:gpid/complete
        ↓
Backend: group_stage_progress.status = COMPLETED
         cek apakah ada stage berikutnya
        ↓
Jika ada: group_stage_progress baru dibuat (LOCKED)
          koordinator menerima notifikasi di Live Monitor
        ↓
Koordinator tap "Konfirmasi Pindah" di Kidversa Web
        ↓
PATCH /api/v1/stage-progress/:gpid/unlock
        ↓
Backend: status = UNLOCKED
         Fasilitator Stage N+1 menerima notifikasi
         "Kelompok [nama] siap masuk"
        ↓
Fasilitator Stage N+1 tap "Terima Kelompok"
        ↓
status = IN_PROGRESS
```

### 7.4 Alur Non-Sequential (Override)

Tersedia di Kidversa Web → Live Monitor → menu per kelompok:

- **Skip Stage**: tandai stage sebagai `COMPLETED` tanpa fasilitator menyelesaikan
- **Jump to Stage**: set kelompok langsung ke stage tertentu (`UNLOCKED`)
- **Reset Progress**: kembalikan semua stage kelompok ke `LOCKED`
- **Manual Unlock**: unlock stage tanpa menunggu konfirmasi

Semua aksi override dicatat di `audit_logs`.

### 7.5 Polling Spec

Kidversa Mobile melakukan polling setiap **5 detik** ke:

```
GET /api/v1/sessions/:sid/my-stage-status
```

Response:
```json
{
  "stage": { "id": "...", "name": "Sapa Profesi", "sequence_order": 1 },
  "groups_incoming": [
    { "id": "...", "name": "Kelompok Merah", "status": "UNLOCKED" }
  ],
  "groups_active": [
    { "id": "...", "name": "Kelompok Biru", "status": "IN_PROGRESS" }
  ]
}
```

### 7.6 Business Rules

- **BR-SE01**: Stage berikutnya hanya bisa di-unlock setelah stage saat ini `COMPLETED` (mode sequential default).
- **BR-SE02**: Override hanya bisa dilakukan oleh `KOORDINATOR` atau `ADMIN_WISATA`.
- **BR-SE03**: Semua override dicatat di audit log dengan `user_id`, `action`, `reason`.
- **BR-SE04**: Jika koneksi ke cloud terputus, polling fallback ke mini PC lokal secara otomatis (endpoint yang sama, base URL berbeda).

### 7.7 API Endpoints

```
GET    /api/v1/sessions/:sid/live-status               # Dashboard koordinator
GET    /api/v1/sessions/:sid/my-stage-status           # Status untuk fasilitator
POST   /api/v1/stage-progress/:gpid/complete           # Fasilitator: tandai selesai
PATCH  /api/v1/stage-progress/:gpid/unlock             # Koordinator: konfirmasi pindah
PATCH  /api/v1/stage-progress/:gpid/skip               # Override: skip stage
PATCH  /api/v1/stage-progress/:gpid/jump               # Override: jump to stage
PATCH  /api/v1/stage-progress/:gpid/reset              # Override: reset progres
```

---

## 8. Modul M-04 — Learner Interface

**Antarmuka**: Kidversa Web (route khusus, kiosk mode)
**Aktor**: Anak (pasif) — dikontrol fasilitator
**Prioritas**: P0

### 8.1 Deskripsi

Learner Interface adalah tampilan full-screen yang dijalankan di monitor setiap pos. Menampilkan konten stage aktif — video, slideshow, atau game. Tidak ada navigasi atau tombol yang dapat diakses anak.

### 8.2 URL Structure

```
/learner/:session_id/:stage_id?token=<kiosk_token>
```

`kiosk_token` adalah token khusus read-only yang di-generate saat sesi dimulai, valid selama durasi sesi. Tidak memerlukan login fasilitator.

### 8.3 Layout Layar

```
┌────────────────────────────────────────────────────┐
│  FULL SCREEN — tidak ada chrome browser             │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │                                              │   │
│  │         KONTEN STAGE AKTIF                   │   │
│  │   (Video / Slideshow / Game)                 │   │
│  │                                              │   │
│  │                                              │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  [Stage Name]    [Durasi tersisa: 08:42]     │   │
│  └──────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

### 8.4 Tipe Konten

| `content_type` | Renderer | Interaksi |
|---|---|---|
| `VIDEO` | HTML5 `<video>`, autoplay, loop | Tidak ada |
| `SLIDESHOW` | Sequence gambar dengan narasi audio | Tidak ada (auto-advance) |
| `GAME` | Embedded iframe dari `stage_contents.file_url` | Sentuh layar (Stage 2) |
| `MIXED` | Kombinasi video + slideshow | Tidak ada |

### 8.5 Business Rules

- **BR-LI01**: Learner Interface tidak bisa diakses tanpa `kiosk_token` yang valid.
- **BR-LI02**: Konten video/gambar/audio di-preload ke browser cache saat token pertama kali dimuat.
- **BR-LI03**: Jika koneksi terputus, konten yang sudah di-cache tetap bisa diputar.
- **BR-LI04**: Game di Stage 2 harus memiliki touch target minimal 80×80px sesuai panduan UX anak.
- **BR-LI05**: Timer durasi stage ditampilkan sebagai informasi fasilitator — tidak memblokir konten saat habis.

### 8.6 API Endpoints

```
GET  /api/v1/learner/:session_id/:stage_id   # Ambil konten stage (kiosk_token required)
POST /api/v1/learner/token                   # Generate kiosk_token (KOORDINATOR only)
```

---

## 9. Modul M-05 — Fasilitator Module

**Antarmuka**: Kidversa Mobile (PWA)
**Aktor**: Fasilitator Stage
**Prioritas**: P0

### 9.1 Deskripsi

Fasilitator Module adalah antarmuka utama fasilitator di Kidversa Mobile. Mencakup semua yang dibutuhkan selama sesi: lihat kelompok, entry nilai, navigasi stage, akses smart photo dan recording.

### 9.2 Screen Flow Kidversa Mobile

```
[Splash / Login]
        ↓
[Dashboard Fasilitator]
    ├─ "Sesi Hari Ini" → [Detail Sesi]
    │       ├─ [Daftar Kelompok Masuk] ── tap kelompok ──►
    │       │                                             │
    │       │   [Kelompok Aktif]                          │
    │       │       ├─ [Daftar Anak]                      │
    │       │       │    └─ tap anak → [Profil Anak]      │
    │       │       │           ├─ Entry Nilai (M-09)     │
    │       │       │           ├─ Smart Photo (M-06)     │
    │       │       │           └─ Recording (M-07)       │
    │       │       └─ [Tombol "Kelompok Selesai"]        │
    │       └─ Status koneksi (online/offline)            │
    └─ [Riwayat Sesi] (readonly)
```

### 9.3 Halaman Dashboard Fasilitator

**Konten:**
- Nama fasilitator + stage yang ditugaskan
- Status koneksi: `● Online (Cloud)` / `● Online (Edge)` / `○ Offline`
- Kelompok sedang aktif (jika ada)
- Kelompok menunggu (status `UNLOCKED`)
- Tombol quick-access: Nilai · Foto · Rekam

**Polling interval**: 5 detik saat app aktif di foreground.

### 9.4 Halaman Daftar Anak per Kelompok

Untuk setiap anak ditampilkan:
- Nama anak + usia
- Status nilai stage ini: `Belum dinilai` / `★★★☆☆` (jika sudah)
- Badge: `📷 Foto` (jika sudah ada foto) · `🎥 Rekam` (jika sudah ada rekaman)
- Tap → masuk ke Profil Anak

### 9.5 Halaman Profil Anak (Hub Aksi)

```
┌─────────────────────────────────────┐
│  [Foto anak atau placeholder]       │
│  Nama Anak · 6 tahun · SD Matahari  │
├─────────────────────────────────────┤
│  Stage: Sapa Profesi                │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  ★ ★ ★ ☆ ☆                  │    │
│  │  [Tap bintang untuk nilai]  │    │
│  └─────────────────────────────┘    │
│  Komentar:                          │
│  [________________________]         │
│  [Simpan Nilai]                     │
├─────────────────────────────────────┤
│  [📷 Smart Photo]  [🎥 Rekam]       │
└─────────────────────────────────────┘
```

### 9.6 Business Rules

- **BR-F01**: Fasilitator hanya bisa melihat dan menilai kelompok yang ada di stage mereka.
- **BR-F02**: Nilai dapat diubah selama sesi masih `ACTIVE` dan grup belum `COMPLETED` di stage ini.
- **BR-F03**: Tombol "Kelompok Selesai" muncul hanya jika semua anak dalam kelompok sudah dinilai (dapat dikonfigurasi: wajib atau opsional per program).
- **BR-F04**: Semua aksi (nilai, foto, rekam) disimpan ke IndexedDB terlebih dahulu, lalu sync ke server.
- **BR-F05**: Status koneksi ditampilkan secara transparan — fasilitator tahu apakah sedang online/offline.

---

## 10. Modul M-06 — Smart Photo Module

**Antarmuka**: Kidversa Mobile (PWA)
**Aktor**: Fasilitator Stage
**Prioritas**: P1

### 10.1 Deskripsi

Smart Photo memungkinkan fasilitator mengambil foto kegiatan anak, menambahkan frame bertema wisata, dan menyimpan hasilnya. Semua proses berjalan **sepenuhnya offline** menggunakan Canvas API.

### 10.2 Screen Flow Smart Photo

```
[Profil Anak] → tap [📷 Smart Photo]
        ↓
[Pilih Aksi]
    ├─ "Ambil Foto Baru" → [Kamera View]
    │       ├─ Preview kamera (kamera belakang)
    │       ├─ Tombol Shutter (80×80px min)
    │       └─ Foto diambil → [Editor Foto]
    └─ "Pilih dari Galeri Sesi" → [Grid Foto Sesi]
                                    └─ tap foto → [Editor Foto]

[Editor Foto]
    ├─ Preview foto
    ├─ [Frame Picker] — horizontal scroll frame tersedia
    │       └─ tap frame → preview real-time (Canvas)
    ├─ Tombol "Simpan" → tersimpan di IndexedDB
    └─ Tombol "Jadikan Foto Raport" (toggle)
            └─ Hanya jika consent_photo = true
```

### 10.3 Spesifikasi Canvas Overlay

```javascript
// Pseudo-code alur Canvas overlay
const canvas = document.createElement('canvas');
canvas.width = 1280;  // output width
canvas.height = 960;  // output height (4:3)
const ctx = canvas.getContext('2d');

// 1. Draw foto asli
ctx.drawImage(photoImg, 0, 0, 1280, 960);

// 2. Draw frame PNG (alpha channel) di atas foto
ctx.drawImage(frameImg, 0, 0, 1280, 960);

// 3. Export ke JPEG
const result = canvas.toDataURL('image/jpeg', 0.85);
```

Frame harus berformat **PNG dengan transparansi** — bagian tengah transparan (foto anak terlihat), border/ornamen adalah frame.

### 10.4 Manajemen Frame Offline

Frame di-cache via Service Worker saat PWA pertama kali di-load atau saat sync:

```javascript
// service-worker.js
const FRAME_CACHE = 'kidversa-frames-v1';

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/frames/')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
```

Saat sync, Service Worker otomatis cache frame baru dari `GET /api/v1/frames?program_id=X`.

### 10.5 Business Rules

- **BR-SP01**: Foto dapat diambil tanpa koneksi — disimpan ke IndexedDB, upload saat sync.
- **BR-SP02**: Maksimal **10 foto per anak per sesi** (dapat dikonfigurasi per program).
- **BR-SP03**: Hanya **1 foto** yang dapat ditandai sebagai "foto raport" per anak.
- **BR-SP04**: "Foto raport" hanya bisa di-set jika `participant.consent_photo = true`.
- **BR-SP05**: Foto asli (tanpa frame) dan foto dengan frame keduanya disimpan — foto asli di `original_file_url`, foto dengan frame di `framed_file_url`.
- **BR-SP06**: Jika frame baru diupload Admin Wisata setelah fasilitator sudah install PWA, frame baru akan tersedia setelah sync berikutnya (bukan real-time).
- **BR-SP07**: Minimal 1 frame default ("no frame" — foto polos) selalu tersedia offline.

### 10.6 API Endpoints

```
GET    /api/v1/frames?program_id=X            # List frame aktif per program
GET    /api/v1/frames/:id/file                # Download file frame (PNG)
POST   /api/v1/photos                         # Upload foto (sync dari device)
GET    /api/v1/photos?participant_id=X        # List foto per peserta
PATCH  /api/v1/photos/:id/set-report          # Set sebagai foto raport
DELETE /api/v1/photos/:id                     # Hapus foto
```

---

## 11. Modul M-07 — Recording Service

**Antarmuka**: Kidversa Mobile (capture) · Kidversa Web (review)
**Aktor**: Fasilitator (capture) · Koordinator (review)
**Prioritas**: P1

### 11.1 Deskripsi

Recording Service mengelola perekaman video+audio anak selama stage Refleksi (atau stage lain yang dikonfigurasi `is_recording_stage = true`), penyimpanan lokal, dan sinkronisasi ke cloud.

### 11.2 Screen Flow Recording (Kidversa Mobile)

```
[Profil Anak] → tap [🎥 Rekam]
        ↓
[Cek Consent]
    ├─ consent_recording = false → [Pesan: "Rekaman tidak diizinkan"]
    └─ consent_recording = true → [Pre-Recording Screen]

[Pre-Recording Screen]
    ├─ Pertanyaan refleksi ditampilkan (dari stage config)
    │   contoh: "Apa yang paling kamu suka hari ini?"
    ├─ Panduan posisi kamera (ilustrasi)
    └─ Tombol "Mulai Rekam" (besar, hijau)
            ↓
    [Recording Screen]
        ├─ Preview kamera belakang
        ├─ Timer countdown (90 detik)
        ├─ Waveform audio indicator
        └─ Tombol "Selesai" + "Batal"
                ↓
    [Preview & Konfirmasi]
        ├─ Putar ulang rekaman
        ├─ Tombol "Simpan" → IndexedDB → sync queue
        └─ Tombol "Rekam Ulang"
```

### 11.3 Implementasi MediaRecorder API

```javascript
// Inisialisasi kamera + mikrofon
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'environment',  // kamera belakang
    width: { ideal: 1280 },
    height: { ideal: 720 }
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    sampleRate: 44100
  }
});

const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'video/webm;codecs=vp8,opus'
});

const chunks = [];
mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

mediaRecorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'video/webm' });
  // Simpan ke IndexedDB
  await saveToIndexedDB('recordings', {
    participant_id: currentParticipant.id,
    session_stage_id: currentStage.id,
    blob: blob,
    duration: recordingDuration,
    taken_at: new Date().toISOString(),
    sync_status: 'LOCAL'
  });
};

// Auto-stop setelah MAX_RECORDING_SECONDS (default: 90)
setTimeout(() => mediaRecorder.stop(), MAX_RECORDING_SECONDS * 1000);
```

### 11.4 Upload Queue

```
IndexedDB (sync_status: LOCAL)
        ↓
Sync Engine deteksi rekaman belum di-upload
        ↓
POST /api/v1/recordings/upload (multipart/form-data)
    - file: blob WebM
    - participant_id
    - session_stage_id
    - duration_seconds
    - taken_at
        ↓
Server simpan ke MinIO → update sync_status: SYNCED
        ↓
Trigger Google Cloud STT untuk transkrip (async)
```

### 11.5 Business Rules

- **BR-R01**: Recording hanya aktif di stage dengan `is_recording_stage = true`.
- **BR-R02**: Cek `consent_recording` sebelum membuka kamera — jika false, tampilkan pesan informatif.
- **BR-R03**: Maksimal **1 rekaman per anak per stage** (rekaman baru menggantikan yang lama).
- **BR-R04**: Rekaman disimpan lokal di IndexedDB dengan `sync_status: LOCAL` sampai berhasil diupload.
- **BR-R05**: Jika upload gagal, Sync Engine retry hingga 3 kali dengan interval exponential backoff (1 menit, 5 menit, 15 menit).
- **BR-R06**: File rekaman di IndexedDB dihapus setelah sync_status `SYNCED` dikonfirmasi server.
- **BR-R07**: Durasi maksimal rekaman: 90 detik (dikonfigurasi via `MAX_RECORDING_SECONDS`, default 90).

### 11.6 API Endpoints

```
POST   /api/v1/recordings/upload                  # Upload file rekaman
GET    /api/v1/recordings?session_id=X            # List rekaman per sesi
GET    /api/v1/recordings/:id                     # Detail + URL streaming
GET    /api/v1/recordings/:id/transcript          # Hasil STT
PATCH  /api/v1/recordings/:id/emotion-tags        # Update tag emosi
DELETE /api/v1/recordings/:id                     # Hapus rekaman
```

---

## 12. Modul M-08 — Reflection Analyzer

**Antarmuka**: Kidversa Web
**Aktor**: Koordinator, Fasilitator (review)
**Prioritas**: P2

### 12.1 Deskripsi

Reflection Analyzer memungkinkan koordinator/fasilitator mereview rekaman refleksi anak, melihat transkrip otomatis, dan menggunakan AI tagging ekspresi sebagai referensi penilaian.

### 12.2 Screen Flow

```
[Backoffice] → [Recording Review]
        ↓
[Daftar Rekaman Belum Direview]
    ├─ Filter: per sesi, per stage, per kelompok
    └─ Klik rekaman → [Detail Review]

[Detail Review]
    ├─ Video player (streaming dari MinIO signed URL)
    ├─ Transkrip (dari Google Cloud STT)
    ├─ AI Emotion Tags: "Antusias 87% | Netral 10% | Ragu 3%"
    ├─ Override Tag: [Dropdown: Antusias / Netral / Ragu / Bingung]
    ├─ Catatan reviewer (optional)
    └─ Tombol "Selesai Review"
            ↓
    recordings.review_status = REVIEWED
```

### 12.3 AI Emotion Tagging

Menggunakan model AI untuk menganalisis ekspresi wajah dari video (integrasi di masa depan). Untuk fase awal, tagging dilakukan berdasarkan analisis **transkrip teks** via Claude API:

```
Prompt ke Claude API:
"Berikut transkrip jawaban anak usia 5-7 tahun saat sesi refleksi:
'{transcript}'
Berikan analisis singkat ekspresi emosi anak berdasarkan pilihan kata dan
antusiasme yang terlihat dari teks. Pilih satu tag utama dari:
[antusias, netral, ragu, bingung] dan berikan skor keyakinan 0–100."
```

Response disimpan ke `recordings.emotion_tags_json`.

### 12.4 Business Rules

- **BR-RA01**: URL streaming rekaman menggunakan **signed URL** MinIO dengan expiry 1 jam — tidak ada URL permanen yang bisa dishare.
- **BR-RA02**: Review recording hanya bisa dilakukan oleh user dalam tenant yang sama.
- **BR-RA03**: AI tagging bersifat **saran** — reviewer wajib konfirmasi atau override sebelum raport digenerate.
- **BR-RA04**: Transkrip STT diproses secara async setelah upload — status: `PENDING` → `DONE` → ditampilkan saat review.

---

## 13. Modul M-09 — Assessment Module

**Antarmuka**: Kidversa Mobile (input) · Kidversa Web (view/edit)
**Aktor**: Fasilitator (input) · Koordinator (view)
**Prioritas**: P0

### 13.1 Deskripsi

Assessment Module menerima, menyimpan, dan memvalidasi nilai bintang dan komentar fasilitator per anak per stage.

### 13.2 Validasi Input Nilai

| Field | Validasi |
|---|---|
| `star_rating` | Integer, required, range 1–5 |
| `comment` | String, optional, max 300 karakter |
| `participant_id` | Harus ada di sesi aktif yang sama |
| `session_stage_id` | Fasilitator harus ditugaskan di stage ini |

### 13.3 Offline Assessment Flow

```javascript
// Kidversa Mobile — simpan ke IndexedDB dulu
async function saveAssessment(data) {
  await indexedDB.put('assessments', {
    ...data,
    _local_id: generateUUID(),
    _sync_status: 'PENDING',
    _created_at: new Date().toISOString()
  });
  // Trigger sync jika online
  if (navigator.onLine) await syncAssessments();
}

// Sync ke server
async function syncAssessments() {
  const pending = await indexedDB.getAll('assessments', { _sync_status: 'PENDING' });
  for (const assessment of pending) {
    try {
      await api.post('/api/v1/assessments', assessment);
      await indexedDB.update('assessments', assessment._local_id, { _sync_status: 'DONE' });
    } catch (err) {
      await indexedDB.update('assessments', assessment._local_id, {
        _sync_status: 'FAILED', _error: err.message
      });
    }
  }
}
```

### 13.4 Business Rules

- **BR-A01**: Satu anak dapat memiliki **hanya satu nilai** per stage (upsert — nilai baru mengganti yang lama).
- **BR-A02**: Nilai hanya bisa diubah selama sesi `ACTIVE`.
- **BR-A03**: Koordinator dapat lihat semua nilai di Backoffice — tidak bisa edit nilai fasilitator lain kecuali dalam kondisi darurat (dicatat di audit log).
- **BR-A04**: Nilai dianggap "lengkap" jika semua peserta dalam kelompok sudah dinilai di stage tersebut.

### 13.5 API Endpoints

```
POST   /api/v1/assessments                    # Buat/update nilai (upsert)
POST   /api/v1/assessments/bulk               # Bulk upsert dari sync
GET    /api/v1/assessments?participant_id=X   # Nilai per peserta
GET    /api/v1/assessments?session_id=X       # Rekap nilai per sesi
```

---

## 14. Modul M-10 — Raport Engine

**Antarmuka**: Kidversa Web (generate & review) · Kidversa Parent (view)
**Aktor**: Koordinator (approve) · Orang Tua (view)
**Prioritas**: P1

### 14.1 Deskripsi

Raport Engine mengumpulkan semua data penilaian, memanggil Claude API untuk narasi, menyusun PDF, dan mendistribusikannya ke orang tua.

### 14.2 Alur Generate Raport

```
Koordinator → Backoffice → [Raport Manager]
        ↓
Pilih sesi → klik "Generate Semua Raport"
        ↓
Backend validasi: semua nilai sudah lengkap?
    ├─ Ada yang belum → tampilkan daftar peserta yang nilainya belum lengkap
    └─ Semua lengkap → lanjut
        ↓
Untuk setiap peserta:
    1. Kumpulkan data: identitas + nilai + komentar + misi (M-11)
    2. Call Claude API → generate draft narasi
    3. Simpan ke reports.ai_narrative_draft
    4. Status: PENDING_REVIEW
        ↓
Koordinator review daftar raport
    └─ Klik peserta → [Review Raport]
            ├─ Preview raport lengkap
            ├─ Edit narasi AI (textarea)
            └─ Tombol "Approve"
                    ↓
            reports.ai_narrative_final = edited_text
            reports.status = APPROVED
            reports.approved_by = user_id
        ↓
Koordinator klik "Kirim Semua Raport" (atau per individu)
        ↓
Backend: generate PDF via Puppeteer
         upload PDF ke MinIO
         kirim WhatsApp + email ke parent_phone / parent_email
         reports.status = SENT
         reports.sent_at = now()
```

### 14.3 Claude API Prompt Template

```
System: "Kamu adalah asisten yang menulis narasi raport anak usia 5-7 tahun
untuk program Edu Wisata. Gunakan bahasa Indonesia yang hangat, encouraging,
dan mudah dipahami orang tua. Hindari framing negatif — ubah area yang perlu
dikembangkan menjadi framing positif yang konstruktif. Panjang 3-5 kalimat."

User: "Buat narasi raport untuk:
Nama anak: {child_name} ({child_age} tahun)
Program: {program_name}
Penilaian per stage:
{stages.map(s => `- ${s.name}: ${s.star_rating} bintang — "${s.comment}"`).join('\n')}
Tolong tulis narasi yang menggambarkan perjalanan belajar anak hari ini."
```

### 14.4 Struktur PDF Raport

```
Halaman 1:
┌─────────────────────────────────────┐
│  [Logo wisata]  Raport Edu Wisata   │
│  [Nama program] · [Tanggal]         │
├─────────────────────────────────────┤
│  [Foto Smart Photo atau placeholder]│
│  Nama: {child_name}                 │
│  Usia: {child_age} tahun            │
│  Sekolah: {school_name}             │
│  Kelompok: {group_name}             │
├─────────────────────────────────────┤
│  PENILAIAN                          │
│  Stage 1 — {stage_name}: ★★★★☆     │
│  "{komentar fasilitator}"           │
│  (ulangi untuk setiap stage)        │
├─────────────────────────────────────┤
│  NARASI                             │
│  {ai_narrative_final}               │
├─────────────────────────────────────┤
│  MISI LANJUTAN                      │
│  🏠 {misi_rumah}                    │
│  👨‍👩‍👧 {misi_orangtua}               │
│  🏫 {misi_sekolah}                  │
├─────────────────────────────────────┤
│  [Tanda tangan koordinator]         │
│  [Kontak wisata]                    │
└─────────────────────────────────────┘
```

### 14.5 Business Rules

- **BR-RE01**: Raport tidak dapat digenerate jika ada peserta dengan nilai yang belum lengkap — kecuali koordinator eksplisit skip peserta tersebut.
- **BR-RE02**: Narasi AI **wajib direview** sebelum raport dikirim — tidak ada auto-send.
- **BR-RE03**: Setelah `SENT`, raport tidak dapat diubah — hanya bisa digenerate ulang (versi baru) oleh admin.
- **BR-RE04**: Link raport di Kidversa Parent menggunakan signed URL dengan token unik per peserta — tidak dapat diakses tanpa token.
- **BR-RE05**: Foto di raport hanya ditampilkan jika `participant.consent_photo = true` DAN `smart_photos.is_report_photo = true`.

### 14.6 API Endpoints

```
POST   /api/v1/reports/generate/:session_id   # Trigger generate semua raport sesi
GET    /api/v1/reports?session_id=X           # List raport per sesi
GET    /api/v1/reports/:id                    # Detail raport
PUT    /api/v1/reports/:id/narrative          # Update narasi (sebelum approve)
PATCH  /api/v1/reports/:id/approve            # Approve raport
POST   /api/v1/reports/:id/send               # Kirim ke orang tua
POST   /api/v1/reports/send-all/:session_id   # Kirim semua raport sesi
GET    /api/v1/reports/:id/pdf                # Download PDF (signed URL)
```

---

## 15. Modul M-11 — Misi Engine

**Antarmuka**: Kidversa Web (kelola bank misi) · Kidversa Parent (view & tandai selesai)
**Aktor**: Admin Wisata (kelola) · AI (pilih) · Orang Tua (eksekusi)
**Prioritas**: P1

### 15.1 Deskripsi

Misi Engine mengelola bank misi per program dan memilih misi yang paling relevan untuk setiap anak berdasarkan profil nilai mereka.

### 15.2 Form Buat Misi

| Field | Tipe | Validasi |
|---|---|---|
| `program_id` | Select | Required |
| `category` | Select | Required: HOME \| PARENT \| SCHOOL |
| `title_child` | Text | Required, max 100 char — kalimat pendek untuk anak |
| `title_parent` | Text | Required, max 150 char — instruksi untuk orang tua |
| `description_parent` | Textarea | Optional, max 300 — tujuan pedagogis |
| `related_stage_ids` | Multi-select | Optional — stage mana yang diperkuat misi ini |
| `is_active` | Toggle | Default: true |

### 15.3 Algoritma Pemilihan Misi (AI-assisted)

```
Input: nilai bintang per stage untuk satu peserta

1. Identifikasi stage dengan nilai ≤ 3 (area yang perlu diperkuat)
2. Kirim ke Claude API:
   "Program: {program_name}
   Nilai anak per stage: {stage_scores}
   Bank misi tersedia: {missions_list}
   Pilih 2-3 misi yang paling relevan untuk anak ini.
   Pastikan ada minimal 1 dari setiap kategori (HOME, PARENT, SCHOOL).
   Prioritaskan misi yang berkaitan dengan stage bernilai rendah.
   Kembalikan hanya array ID misi yang dipilih."

3. Parse response → simpan ke participant_missions
4. Jika Claude API tidak tersedia → fallback: pilih 1 misi random per kategori
```

### 15.4 Tampilan di Kidversa Parent

```
MISI LANJUTAN untuk {child_name}

🏠 Di Rumah
   "Tanam kacang hijau di gelas plastik dan amati selama 5 hari"
   [✓ Tandai Selesai]

👨‍👩‍👧 Bersama Orang Tua
   "Ajak pergi ke pasar, tunjukkan sayuran dan tanya 'dari mana asalnya?'"
   [✓ Tandai Selesai]

🏫 Di Sekolah
   "Ceritakan kepada teman-teman tentang apa yang dipelajari hari ini"
   [ ] Belum selesai
```

### 15.5 Business Rules

- **BR-M01**: Minimal **3 misi aktif per kategori** (HOME, PARENT, SCHOOL) per program sebelum sesi bisa digenerate raportnya.
- **BR-M02**: Misi yang sudah digunakan di raport tidak dapat diedit atau dihapus — hanya bisa dinonaktifkan.
- **BR-M03**: Orang tua dapat tandai misi selesai kapan saja setelah raport diterima.
- **BR-M04**: Koordinator dapat override pilihan misi AI dari Backoffice sebelum raport diapprove.

### 15.6 API Endpoints

```
GET    /api/v1/mission-banks?program_id=X         # List bank misi
POST   /api/v1/mission-banks                      # Buat misi baru
PUT    /api/v1/mission-banks/:id                  # Edit misi
PATCH  /api/v1/mission-banks/:id/toggle           # Aktif/nonaktif

GET    /api/v1/participant-missions/:pid          # Misi per peserta (Parent)
PATCH  /api/v1/participant-missions/:id/complete  # Tandai selesai (Parent)
```

---

## 16. Modul M-12 — Frame Manager

**Antarmuka**: Kidversa Web
**Aktor**: Admin Wisata
**Prioritas**: P1

### 16.1 Deskripsi

Frame Manager memungkinkan Admin Wisata mengelola library frame PNG untuk Smart Photo, assign ke program tertentu, dan publish ke semua device fasilitator.

### 16.2 Spesifikasi Frame File

| Aspek | Requirement |
|---|---|
| Format | PNG dengan alpha channel (transparansi) |
| Resolusi | Minimal 1280×960px (4:3 ratio) |
| Ukuran file | Maksimal 2MB per frame |
| Area anak | Tengah frame harus transparan (area foto anak) |
| Ornamen | Border, ilustrasi, teks tema di sekitar tepi frame |

### 16.3 Screen Flow

```
[Frame Manager]
    ├─ [Grid frame aktif per program]
    ├─ Tombol "Upload Frame Baru"
    │       ├─ Upload PNG
    │       ├─ Assign ke program(s)
    │       ├─ Nama frame
    │       └─ Preview dengan foto placeholder
    └─ Klik frame → [Detail Frame]
            ├─ Edit nama & assignment
            ├─ Preview
            └─ Nonaktifkan (tidak hapus)
```

### 16.4 Business Rules

- **BR-FM01**: Frame yang sudah dipakai di foto peserta tidak bisa dihapus permanen.
- **BR-FM02**: Saat frame baru dipublish, Service Worker fasilitator akan cache frame tersebut saat sync berikutnya.
- **BR-FM03**: Minimal **1 frame default** ("tanpa frame") selalu tersedia dan tidak bisa dinonaktifkan per program.
- **BR-FM04**: Preview frame harus menggunakan foto placeholder anak (bukan foto nyata) di Backoffice.

### 16.5 API Endpoints

```
GET    /api/v1/frames?program_id=X         # List frame per program (public, untuk PWA)
POST   /api/v1/frames                      # Upload frame baru
PUT    /api/v1/frames/:id                  # Edit frame
PATCH  /api/v1/frames/:id/toggle           # Aktif/nonaktif
GET    /api/v1/frames/:id/file             # Download PNG (untuk cache PWA)
```

---

## 17. Modul M-13 — Content Manager

**Antarmuka**: Kidversa Web
**Aktor**: Admin Wisata
**Prioritas**: P0

### 17.1 Deskripsi

Content Manager mengelola file konten per stage — video, gambar, audio, dan game bundle — yang akan ditampilkan di Learner Interface.

### 17.2 Tipe Konten yang Didukung

| Tipe | Format | Ukuran Maks | Keterangan |
|---|---|---|---|
| Video | MP4 (H.264), WebM | 500MB | Video narasi/pengenalan profesi |
| Gambar | JPG, PNG | 10MB per file | Slideshow, infografis |
| Audio | MP3, AAC | 50MB | Narasi audio, sound effect |
| Game Bundle | ZIP (HTML5 game) | 100MB | Game interaktif Stage 2 |

### 17.3 Screen Flow

```
[Program Detail] → Tab "Stage" → klik stage → [Detail Stage]
        ↓
[Content Manager untuk Stage Ini]
    ├─ List konten (urutan drag-reorder)
    ├─ Tombol "Tambah Konten"
    │       ├─ Upload file
    │       ├─ Judul konten
    │       ├─ Durasi (detik) — opsional, untuk slideshow
    │       └─ Sort order (auto dari posisi)
    └─ Klik konten → preview / edit / hapus
```

### 17.4 Business Rules

- **BR-CM01**: Konten yang sudah dipakai di sesi `COMPLETED` tidak dapat dihapus — hanya dinonaktifkan.
- **BR-CM02**: Video harus di-encode ke **H.264 + AAC** untuk kompatibilitas maksimal di browser.
- **BR-CM03**: Game bundle (ZIP) diekstrak di server dan di-serve sebagai static HTML5 di path unik.
- **BR-CM04**: Semua file konten di-preload ke Service Worker cache saat fasilitator membuka sesi di Kidversa Mobile.

### 17.5 API Endpoints

```
GET    /api/v1/stage-contents?stage_id=X     # List konten per stage
POST   /api/v1/stage-contents                # Upload konten baru
PUT    /api/v1/stage-contents/:id            # Edit metadata
PATCH  /api/v1/stage-contents/reorder        # Update sort_order
DELETE /api/v1/stage-contents/:id            # Hapus konten
GET    /api/v1/stage-contents/:id/serve      # Streaming file (signed URL)
```

---

## 18. Modul M-14 — Auth & Tenant

**Antarmuka**: Semua antarmuka
**Aktor**: Semua user
**Prioritas**: P0

### 18.1 Deskripsi

Auth & Tenant mengelola autentikasi, otorisasi berbasis peran (RBAC), dan isolasi data antar tenant.

### 18.2 Role & Permission Matrix

| Permission | Super Admin | Admin Wisata | Koordinator | Fasilitator |
|---|---|---|---|---|
| Kelola tenant | ✅ | ❌ | ❌ | ❌ |
| Kelola program & stage | ✅ | ✅ | ❌ | ❌ |
| Kelola sesi & peserta | ✅ | ✅ | ✅ | ❌ |
| Kelola fasilitator | ✅ | ✅ | ❌ | ❌ |
| Upload konten & frame | ✅ | ✅ | ❌ | ❌ |
| Monitor live sesi | ✅ | ✅ | ✅ | ❌ |
| Override stage | ✅ | ✅ | ✅ | ❌ |
| Input nilai & foto & rekaman | ❌ | ❌ | ❌ | ✅ |
| Review rekaman | ✅ | ✅ | ✅ | ❌ |
| Approve & kirim raport | ✅ | ✅ | ✅ | ❌ |
| Lihat analytics | ✅ | ✅ | ✅ | ❌ |

### 18.3 Autentikasi

- **JWT Token**: Access token (expiry 8 jam) + Refresh token (expiry 30 hari)
- **Multi-device**: Fasilitator boleh login di beberapa device (untuk pergantian HP)
- **Kiosk Token**: Token khusus read-only untuk Learner Interface (tidak dapat akses API lain)
- **Parent Token**: Token unik per peserta untuk Kidversa Parent (tidak perlu password)

### 18.4 Tenant Isolation

Semua query di backend otomatis di-scope ke `tenant_id` dari JWT payload. Middleware `TenantGuard` memastikan tidak ada data lintas tenant.

```typescript
// NestJS Guard
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // dari JWT
    request.tenantId = user.tenant_id;
    return true;
  }
}
```

### 18.5 API Endpoints

```
POST   /api/v1/auth/login           # Login → JWT
POST   /api/v1/auth/refresh         # Refresh token
POST   /api/v1/auth/logout          # Revoke token
GET    /api/v1/auth/me              # Profil user aktif

GET    /api/v1/users                # List user (Admin Wisata ke bawah)
POST   /api/v1/users                # Buat user baru
PUT    /api/v1/users/:id            # Edit user
PATCH  /api/v1/users/:id/role       # Update role
DELETE /api/v1/users/:id            # Nonaktifkan user

POST   /api/v1/auth/kiosk-token     # Generate kiosk token
POST   /api/v1/auth/parent-token    # Generate parent access token
```

---

## 19. Modul M-15 — Consent & Privacy

**Antarmuka**: Kidversa Parent (submit) · Kidversa Web (pantau)
**Aktor**: Orang Tua (consent) · Admin (pantau)
**Prioritas**: P0

### 19.1 Alur Pengiriman Consent

```
Admin/Koordinator → klik "Kirim Consent Request" per sesi
        ↓
Sistem kirim WhatsApp ke setiap parent_phone:
"Halo {parent_name}, anak Anda {child_name} akan mengikuti program
Edu Wisata '{program_name}' pada {session_date}.
Klik link berikut untuk memberikan izin: {consent_url}"
        ↓
Orang tua buka link → [Consent Form di Kidversa Parent]
        ↓
[Consent Form]
    ├─ Penjelasan program
    ├─ Toggle: "Izinkan perekaman video/audio anak saya"
    ├─ Toggle: "Izinkan foto anak saya ditampilkan di raport"
    ├─ Kolom nama orang tua (konfirmasi)
    └─ Tombol "Kirim Persetujuan"
        ↓
Backend update:
    participant.consent_recording = value
    participant.consent_photo = value
    participant.consent_at = now()
    consent_logs: catat IP, timestamp, nilai consent
```

### 19.2 Graceful Degradation

| Consent Status | Efek |
|---|---|
| Belum merespons H-0 pagi | Fitur recording & foto dinonaktifkan untuk anak tersebut — sesi tetap berjalan |
| consent_recording = false | Recording dinonaktifkan — Stage recording berjalan dengan penilaian observasi biasa |
| consent_photo = false | Smart Photo tetap bisa diambil tapi TIDAK bisa dijadikan foto raport |

### 19.3 Business Rules

- **BR-CP01**: Consent request dikirim otomatis H-2 setelah peserta didaftarkan (atau manual oleh koordinator).
- **BR-CP02**: Orang tua dapat **mengubah consent** kapan saja sebelum sesi dimulai.
- **BR-CP03**: Setelah sesi `COMPLETED`, consent tidak dapat diubah.
- **BR-CP04**: Semua aksi consent dicatat di `consent_logs` — tidak dapat dihapus (audit trail).
- **BR-CP05**: URL consent menggunakan token unik per peserta yang expire setelah sesi selesai + 7 hari.

### 19.4 API Endpoints

```
POST   /api/v1/consent/send/:session_id       # Kirim WhatsApp consent request
GET    /api/v1/consent/form/:token            # Tampilkan form consent (public)
POST   /api/v1/consent/submit/:token          # Submit consent (public)
GET    /api/v1/consent/status/:session_id     # Status consent per sesi
GET    /api/v1/consent/logs/:participant_id   # Audit log consent
```

---

## 20. Modul M-16 — Sync Engine

**Antarmuka**: Background service (semua device)
**Aktor**: Sistem
**Prioritas**: P0

### 20.1 Arsitektur Sync

```
Device (IndexedDB) ──► Sync Engine Client ──► Sync Engine Server
                              │
                        Deteksi koneksi
                        (ping cloud/edge)
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
               Cloud OK            Cloud tidak bisa
               (konek cloud)        (konek mini PC lokal)
```

### 20.2 Tipe Data yang Disinkronisasi

| Tipe | Prioritas Sync | Ukuran Tipikal |
|---|---|---|
| `ASSESSMENT` (nilai + komentar) | Tinggi (segera) | <1 KB |
| `PROGRESS` (stage progress) | Tinggi (segera) | <1 KB |
| `PHOTO` (foto Smart Photo) | Sedang (background) | ~500 KB |
| `RECORDING` (video rekaman) | Rendah (background) | ~15–20 MB |

### 20.3 Conflict Resolution

```
Scenario: Fasilitator input nilai offline, koordinator juga input nilai yang sama via web

Resolution:
1. Bandingkan timestamp kedua data
2. Data dengan timestamp LEBIH BARU menang (last-write-wins)
3. Jika timestamp sama: data dari device fasilitator (EDGE) prioritas untuk assessment
4. Log konflik ke audit_logs
```

### 20.4 Mini PC ↔ Cloud Sync

```
Di akhir sesi (atau saat internet tersedia):

1. Sync Engine Server di mini PC scan sync_queue
2. Kirim batch ke cloud: POST /api/v1/sync/batch
3. Cloud proses, simpan, kembalikan acknowledgment
4. Mini PC update sync_queue.status = DONE
5. Video files: upload chunk per chunk (5MB per chunk)
   dengan retry per chunk jika gagal
```

### 20.5 Business Rules

- **BR-SY01**: Assessment dan progress sync diprioritaskan — harus sync sebelum foto dan video.
- **BR-SY02**: Sync engine retry gagal hingga 3 kali dengan exponential backoff.
- **BR-SY03**: Setelah 3 kali gagal, item masuk status `FAILED` dan admin diberi notifikasi.
- **BR-SY04**: File video dihapus dari IndexedDB setelah `sync_status = SYNCED` dikonfirmasi.
- **BR-SY05**: Sync batch maksimal 100 item per request untuk menghindari timeout.

---

## 21. Modul M-17 — Notification Service

**Antarmuka**: Backend service
**Aktor**: Sistem
**Prioritas**: P1

### 21.1 Tipe Notifikasi

| Event | Channel | Penerima | Template |
|---|---|---|---|
| Consent request | WhatsApp | Orang tua | "Halo {parent_name}, izinkan anak Anda..." |
| Raport siap | WhatsApp + Email | Orang tua | "Raport {child_name} sudah siap! {link}" |
| Raport reminder | WhatsApp | Orang tua (H+3) | "Jangan lupa cek raport {child_name}..." |
| Kelompok selesai stage | Push (PWA) | Fasilitator stage berikutnya | "Kelompok {nama} siap masuk pos Anda" |
| Nilai belum lengkap | Push (PWA) | Fasilitator | "{N} anak belum dinilai di stage Anda" |
| Sync gagal | Email + In-app | Admin Wisata | "Sync gagal untuk sesi {nama}" |

### 21.2 WhatsApp Integration

Menggunakan **WhatsApp Business API** (via provider seperti Wati, Twilio, atau Fonnte):

```typescript
// NestJS service
async sendWhatsApp(phone: string, template: string, params: Record<string, string>) {
  const message = this.renderTemplate(template, params);
  await this.whatsappProvider.sendMessage({
    to: this.formatPhone(phone), // +62xxx format
    message,
    type: 'text'
  });
}
```

### 21.3 PWA Push Notification

```javascript
// Service Worker — handle push
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/kidversa-192.png',
      badge: '/icons/badge-72.png',
      data: { url: data.action_url }
    })
  );
});
```

---

## 22. Modul M-18 — Reporting & Analytics

**Antarmuka**: Kidversa Web
**Aktor**: Admin Wisata, Koordinator
**Prioritas**: P2

### 22.1 Dashboard Utama

```
[Analytics Dashboard]
    ├─ Filter: Program · Sesi · Tanggal range
    ├─ [Statistik Sesi]
    │       ├─ Total peserta
    │       ├─ Total sesi completed
    │       └─ Rata-rata nilai per stage (chart bar)
    ├─ [Distribusi Nilai]
    │       └─ Pie chart: % bintang 1/2/3/4/5 per stage
    ├─ [Keterlibatan Misi]
    │       └─ % misi yang ditandai selesai
    └─ [Raport Terkirim]
            └─ % raport yang sudah dibuka orang tua
```

### 22.2 Export Data

| Format | Konten |
|---|---|
| CSV | Semua nilai per peserta per stage, per sesi |
| PDF | Rekap sesi (ringkasan, bukan raport individual) |
| JSON | Raw data lengkap untuk integrasi pihak ketiga |

### 22.3 API Endpoints

```
GET /api/v1/analytics/session/:id       # Statistik per sesi
GET /api/v1/analytics/program/:id       # Statistik per program
GET /api/v1/analytics/export/:session_id?format=csv|pdf|json
```

---

## 23. API Reference — Endpoint Summary

### 23.1 Base URL

```
Production (Cloud): https://api.kidversa.id/api/v1
Edge (Mini PC):     http://192.168.x.x:3000/api/v1
```

Kidversa Mobile mendeteksi endpoint yang digunakan melalui:

```javascript
async function detectApiEndpoint() {
  try {
    const res = await fetch('https://api.kidversa.id/api/v1/health', { timeout: 5000 });
    if (res.ok) return 'https://api.kidversa.id/api/v1';
  } catch {}
  return 'http://192.168.1.1:3000/api/v1'; // Mini PC (IP dikonfigurasi saat setup)
}
```

### 23.2 Request/Response Format

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
X-Tenant-Id: <tenant_id>        (auto dari JWT, tidak perlu dikirim manual)
X-Device-Id: <device_uuid>      (untuk tracking sync source)
```

**Standard Response:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "total": 42 }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "star_rating harus antara 1 dan 5",
    "field": "star_rating"
  }
}
```

### 23.3 Ringkasan Semua Endpoint per Modul

| Modul | Method | Endpoint |
|---|---|---|
| Auth | POST | `/auth/login`, `/auth/refresh`, `/auth/logout` |
| Program | CRUD | `/programs`, `/programs/:id/stages` |
| Session | CRUD | `/sessions`, `/sessions/:id/participants` |
| Stage Engine | PATCH | `/stage-progress/:id/complete`, `/unlock`, `/skip` |
| Assessment | POST | `/assessments`, `/assessments/bulk` |
| Smart Photo | POST/GET | `/photos`, `/photos/:id/set-report` |
| Recording | POST/GET | `/recordings/upload`, `/recordings/:id` |
| Frames | CRUD | `/frames`, `/frames/:id/file` |
| Content | CRUD | `/stage-contents`, `/stage-contents/:id/serve` |
| Raport | POST/GET | `/reports/generate/:session_id`, `/reports/:id/send` |
| Misi | CRUD | `/mission-banks`, `/participant-missions/:id/complete` |
| Consent | POST | `/consent/send/:session_id`, `/consent/submit/:token` |
| Sync | POST | `/sync/batch` |
| Analytics | GET | `/analytics/session/:id`, `/analytics/export/:id` |

---

## 24. PWA & Offline Specification

### 24.1 Service Worker Strategy

| Resource | Cache Strategy | TTL |
|---|---|---|
| App shell (HTML, JS, CSS) | Cache-first | 7 hari |
| Frame PNG files | Cache-first | 30 hari |
| Stage content (video, gambar) | Cache-first (on demand) | Durasi sesi |
| API responses (daftar anak, sesi) | Network-first, fallback cache | 1 jam |
| Media upload | Queue (IndexedDB) | Sampai sync |

### 24.2 IndexedDB Schema (Kidversa Mobile)

```javascript
const DB_SCHEMA = {
  assessments: {
    keyPath: '_local_id',
    indexes: ['participant_id', 'session_stage_id', '_sync_status']
  },
  photos: {
    keyPath: '_local_id',
    indexes: ['participant_id', '_sync_status']
  },
  recordings: {
    keyPath: '_local_id',
    indexes: ['participant_id', 'session_stage_id', '_sync_status']
    // blob disimpan sebagai ArrayBuffer
  },
  stage_progress: {
    keyPath: '_local_id',
    indexes: ['group_id', '_sync_status']
  },
  session_cache: {
    keyPath: 'session_id'
    // data sesi + peserta + stage untuk offline access
  }
};
```

### 24.3 PWA Manifest (Kidversa Mobile)

```json
{
  "name": "Kidversa Mobile",
  "short_name": "Kidversa",
  "start_url": "/mobile",
  "display": "standalone",
  "background_color": "#0F6E56",
  "theme_color": "#0F6E56",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "permissions": ["camera", "microphone"]
}
```

### 24.4 Offline Indicators

Kidversa Mobile menampilkan status koneksi secara permanen di header:

| Status | Indikator | Warna |
|---|---|---|
| Online (Cloud) | `● Cloud` | Hijau |
| Online (Edge/Mini PC) | `● Edge` | Biru |
| Offline (cache only) | `○ Offline` | Abu-abu |
| Syncing | `⟳ Syncing...` | Kuning |

---

## 25. Traceability Matrix — BRD v3 ke FSD

| BRD Requirement | FSD Modul | Seksi FSD |
|---|---|---|
| F-01 Kelola Kelas & Sesi | M-01 Program Manager | Seksi 5 |
| F-01 Kelola Kelas & Sesi | M-02 Session Manager | Seksi 6 |
| F-02 Penilaian N Stage | M-03 Stage Engine | Seksi 7 |
| F-02 Penilaian N Stage | M-09 Assessment Module | Seksi 13 |
| F-02 Penilaian N Stage | M-05 Fasilitator Module | Seksi 9 |
| F-03 Recording Audio & Video | M-07 Recording Service | Seksi 11 |
| F-03 Recording Audio & Video | M-08 Reflection Analyzer | Seksi 12 |
| F-04 Smart Photo | M-06 Smart Photo Module | Seksi 10 |
| F-04 Smart Photo | M-12 Frame Manager | Seksi 16 |
| F-05 Generate Raport | M-10 Raport Engine | Seksi 14 |
| F-05 Generate Raport | M-11 Misi Engine | Seksi 15 |
| Learner Interface kiosk | M-04 Learner Interface | Seksi 8 |
| 3 antarmuka PWA | M-14 Auth & Tenant | Seksi 18 |
| Hybrid Edge-Cloud | M-16 Sync Engine | Seksi 20 |
| Consent & Privacy (UU PDP) | M-15 Consent & Privacy | Seksi 19 |
| Notification (WhatsApp/email) | M-17 Notification Service | Seksi 21 |
| Analytics & export | M-18 Reporting & Analytics | Seksi 22 |
| Multi-tenant | M-14 Auth & Tenant | Seksi 18 |
| Offline-first PWA | Semua modul + Seksi 24 | Seksi 24 |

---

*Kidversa Edutourism — FSD v1.0 | Juni 2026 | Dokumen ini bersifat internal dan confidential*
*Referensi: BRD v3.0. Dokumen ini menjadi acuan utama implementasi — perubahan requirement harus melalui BRD terlebih dahulu sebelum FSD diupdate.*

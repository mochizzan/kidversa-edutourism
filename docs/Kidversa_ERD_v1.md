# Entity Relationship Diagram
## Kidversa Edutourism

| | |
|---|---|
| **Nama Dokumen** | ERD — Kidversa Edutourism |
| **Versi** | v1.0 |
| **Tanggal** | Juni 2026 |
| **Status** | Draft — Internal Review |
| **Referensi** | BRD v3.0 · FSD v1.0 |

---

## Klasifikasi Tabel

| Kode | Tipe | Deskripsi |
|---|---|---|
| **TM** | Tabel Master | Data referensi yang relatif statis — dikonfigurasi sekali, digunakan berulang |
| **TR** | Tabel Transaksi / Referensi | Data operasional yang dibuat per kejadian (sesi, kelompok, peserta, laporan) |
| **TD** | Tabel Detail | Detail dari tabel TM atau TR — baris turunan yang tidak bisa berdiri sendiri |

---

## Ringkasan Tabel (20 Tabel)

| # | Nama Tabel | Tipe | Modul | Keterangan Singkat |
|---|---|---|---|---|
| 1 | `tenants` | **TM** | M-14 Auth | Root tenant — isolasi data per lokasi wisata |
| 2 | `users` | **TM** | M-14 Auth | Admin, koordinator, fasilitator per tenant |
| 3 | `programs` | **TM** | M-01 Program | Program Edu Wisata per tenant |
| 4 | `program_stages` | **TD** | M-01 Program | Stage-stage dalam satu program |
| 5 | `stage_contents` | **TD** | M-13 Content | Konten (video/gambar/game) per stage |
| 6 | `photo_frames` | **TM** | M-12 Frame | Library frame Smart Photo per program |
| 7 | `mission_banks` | **TM** | M-11 Misi | Bank misi lanjutan per program |
| 8 | `sessions` | **TR** | M-02 Session | Sesi Edu Wisata (kejadian nyata) |
| 9 | `session_stages` | **TD** | M-02 Session | Stage aktif per sesi + assignment fasilitator |
| 10 | `session_groups` | **TR** | M-02 Session | Kelompok anak dalam satu sesi |
| 11 | `group_stage_progress` | **TD** | M-03 Engine | Progres kelompok per stage per sesi |
| 12 | `participants` | **TR** | M-02 Session | Peserta (anak) yang terdaftar di sesi |
| 13 | `assessments` | **TD** | M-09 Assessment | Nilai bintang + komentar per anak per stage |
| 14 | `smart_photos` | **TD** | M-06 Smart Photo | Foto kegiatan anak + frame |
| 15 | `recordings` | **TD** | M-07 Recording | Rekaman video+audio anak |
| 16 | `reports` | **TR** | M-10 Raport | Raport final per anak per sesi |
| 17 | `participant_missions` | **TD** | M-11 Misi | Misi yang dipilih per peserta per raport |
| 18 | `consent_logs` | **TD** | M-15 Consent | Audit trail consent orang tua |
| 19 | `audit_logs` | **TD** | M-14 Auth | Audit trail semua aksi penting |
| 20 | `sync_queue` | **TR** | M-16 Sync | Antrian sinkronisasi edge → cloud |

---

## Detail Tabel

### TM-01 · `tenants`

**Tipe**: Tabel Master
**Modul**: M-14 Auth & Tenant
**Deskripsi**: Root entitas yang mengisolasi seluruh data per lokasi wisata. Setiap lokasi wisata yang menggunakan Kidversa memiliki satu tenant.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `name` | VARCHAR(100) | NOT NULL | Nama lokasi wisata |
| `slug` | VARCHAR(50) | UNIQUE, NOT NULL | Identifier URL-friendly |
| `settings_json` | JSON | NULL | Konfigurasi global tenant |
| `created_at` | TIMESTAMP | NOT NULL | Waktu dibuat |

**Relasi**: `tenants` → `users`, `programs`, `sessions`, `photo_frames`, `sync_queue`

---

### TM-02 · `users`

**Tipe**: Tabel Master
**Modul**: M-14 Auth & Tenant
**Deskripsi**: Semua pengguna sistem — dari Super Admin hingga Fasilitator. Setiap user terikat ke satu tenant.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `tenant_id` | UUID | FK → tenants | Tenant pemilik |
| `email` | VARCHAR(255) | UNIQUE per tenant | Email login |
| `password_hash` | VARCHAR(255) | NOT NULL | Bcrypt hash |
| `role` | ENUM | NOT NULL | `SUPER_ADMIN` \| `ADMIN_WISATA` \| `KOORDINATOR` \| `FASILITATOR` |
| `name` | VARCHAR(100) | NOT NULL | Nama lengkap |
| `phone` | VARCHAR(20) | NULL | Nomor WhatsApp |
| `is_active` | BOOLEAN | DEFAULT true | Status aktif user |
| `created_at` | TIMESTAMP | NOT NULL | Waktu dibuat |

**Relasi**: `users` → `sessions` (created_by), `audit_logs`, `assessments` (assessed_by), `smart_photos` (taken_by), `recordings` (reviewed_by), `reports` (approved_by)

---

### TM-03 · `programs`

**Tipe**: Tabel Master
**Modul**: M-01 Program Manager
**Deskripsi**: Mendefinisikan program Edu Wisata — template yang bisa digunakan berulang di berbagai sesi. Satu tenant bisa punya banyak program (Belajar Bertani, Mengenal Laut, dll).

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `tenant_id` | UUID | FK → tenants | Tenant pemilik |
| `name` | VARCHAR(100) | NOT NULL | Nama program |
| `description` | TEXT | NULL | Deskripsi singkat |
| `thumbnail_url` | VARCHAR(500) | NULL | URL gambar thumbnail |
| `is_active` | BOOLEAN | DEFAULT true | Nonaktif = tidak bisa buat sesi baru |
| `created_at` | TIMESTAMP | NOT NULL | Waktu dibuat |

**Relasi**: `programs` → `program_stages` (detail), `photo_frames`, `mission_banks`, `sessions`

---

### TD-04 · `program_stages`

**Tipe**: Tabel Detail (dari `programs`)
**Modul**: M-01 Program Manager
**Deskripsi**: Setiap baris adalah satu stage dalam program — nama, tujuan, dan konfigurasi. Tidak bisa berdiri sendiri tanpa `programs`.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `program_id` | UUID | FK → programs | Program induk |
| `sequence_order` | INT | NOT NULL | Urutan stage (1, 2, 3...) |
| `name` | VARCHAR(80) | NOT NULL | Nama stage, misal "Sapa Profesi" |
| `description` | TEXT | NULL | Tujuan pedagogis |
| `content_type` | ENUM | NOT NULL | `VIDEO` \| `SLIDESHOW` \| `GAME` \| `MIXED` |
| `duration_minutes` | INT | DEFAULT 12 | Durasi maksimal (menit) |
| `is_recording_stage` | BOOLEAN | DEFAULT false | Aktifkan fitur recording |
| `is_photo_stage` | BOOLEAN | DEFAULT true | Aktifkan Smart Photo |
| `created_at` | TIMESTAMP | NOT NULL | Waktu dibuat |

**Relasi**: `program_stages` → `stage_contents` (detail), `session_stages`

**Constraint tambahan**: `UNIQUE(program_id, sequence_order)` — tidak boleh ada dua stage dengan urutan sama dalam satu program.

---

### TD-05 · `stage_contents`

**Tipe**: Tabel Detail (dari `program_stages`)
**Modul**: M-13 Content Manager
**Deskripsi**: File konten (video, gambar, audio, game) yang ditampilkan dalam satu stage. Satu stage bisa punya banyak konten berurutan.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `program_stage_id` | UUID | FK → program_stages | Stage induk |
| `title` | VARCHAR(150) | NOT NULL | Judul konten |
| `file_url` | VARCHAR(500) | NOT NULL | URL ke MinIO / CDN |
| `file_type` | ENUM | NOT NULL | `VIDEO` \| `IMAGE` \| `AUDIO` \| `GAME_BUNDLE` |
| `duration_seconds` | INT | NULL | Durasi (khusus video/audio) |
| `sort_order` | INT | NOT NULL | Urutan tampil |
| `is_active` | BOOLEAN | DEFAULT true | Konten aktif/nonaktif |
| `created_at` | TIMESTAMP | NOT NULL | Waktu dibuat |

---

### TM-06 · `photo_frames`

**Tipe**: Tabel Master
**Modul**: M-12 Frame Manager
**Deskripsi**: Library frame PNG bertema wisata yang dikelola Admin Wisata. Di-cache di PWA fasilitator saat sync.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `tenant_id` | UUID | FK → tenants | Tenant pemilik |
| `program_id` | UUID | FK → programs, NULL | NULL = berlaku untuk semua program tenant |
| `name` | VARCHAR(100) | NOT NULL | Nama frame |
| `file_url` | VARCHAR(500) | NOT NULL | URL file PNG (alpha channel) |
| `thumbnail_url` | VARCHAR(500) | NULL | URL thumbnail preview |
| `is_active` | BOOLEAN | DEFAULT true | Aktif/nonaktif |
| `sort_order` | INT | DEFAULT 0 | Urutan tampil di frame picker |
| `created_at` | TIMESTAMP | NOT NULL | Waktu dibuat |

**Relasi**: `photo_frames` → `smart_photos`

---

### TM-07 · `mission_banks`

**Tipe**: Tabel Master
**Modul**: M-11 Misi Engine
**Deskripsi**: Bank misi lanjutan yang dibuat Admin Wisata per program. AI memilih dari bank ini berdasarkan profil nilai anak.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `program_id` | UUID | FK → programs | Program terkait |
| `category` | ENUM | NOT NULL | `HOME` \| `PARENT` \| `SCHOOL` |
| `title_child` | VARCHAR(150) | NOT NULL | Kalimat misi versi anak |
| `title_parent` | VARCHAR(200) | NOT NULL | Instruksi versi orang tua |
| `description_parent` | TEXT | NULL | Penjelasan tujuan pedagogis |
| `related_stage_ids` | JSON | NULL | Array UUID stage yang diperkuat |
| `is_active` | BOOLEAN | DEFAULT true | Aktif/nonaktif |
| `created_at` | TIMESTAMP | NOT NULL | Waktu dibuat |

**Relasi**: `mission_banks` → `participant_missions`

---

### TR-08 · `sessions`

**Tipe**: Tabel Transaksi
**Modul**: M-02 Session Manager
**Deskripsi**: Satu sesi = satu pelaksanaan nyata program Edu Wisata pada tanggal tertentu. Tabel ini adalah pusat dari seluruh aktivitas hari-H.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `tenant_id` | UUID | FK → tenants | Tenant pemilik |
| `program_id` | UUID | FK → programs | Program yang dijalankan |
| `name` | VARCHAR(100) | NOT NULL | Nama sesi |
| `session_date` | DATE | NOT NULL | Tanggal pelaksanaan |
| `location` | VARCHAR(200) | NOT NULL | Nama/alamat lokasi |
| `status` | ENUM | DEFAULT 'DRAFT' | `DRAFT` \| `ACTIVE` \| `COMPLETED` \| `CANCELLED` |
| `notes` | TEXT | NULL | Catatan internal |
| `created_by` | UUID | FK → users | User yang membuat |
| `created_at` | TIMESTAMP | NOT NULL | Waktu dibuat |

**Relasi**: `sessions` → `session_stages` (detail), `session_groups`, `participants`, `reports`, `smart_photos`

---

### TD-09 · `session_stages`

**Tipe**: Tabel Detail (dari `sessions`)
**Modul**: M-02 Session Manager
**Deskripsi**: Instansiasi stage per sesi — menghubungkan stage program dengan fasilitator yang ditugaskan dan mencatat status aktual sesi.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `session_id` | UUID | FK → sessions | Sesi induk |
| `program_stage_id` | UUID | FK → program_stages | Stage referensi |
| `fasilitator_id` | UUID | FK → users, NULL | Fasilitator yang bertugas |
| `status` | ENUM | DEFAULT 'WAITING' | `WAITING` \| `ACTIVE` \| `COMPLETED` |
| `started_at` | TIMESTAMP | NULL | Waktu stage dimulai |
| `completed_at` | TIMESTAMP | NULL | Waktu stage selesai |

**Constraint tambahan**: `UNIQUE(session_id, program_stage_id)` — satu stage hanya muncul sekali per sesi.

---

### TR-10 · `session_groups`

**Tipe**: Tabel Transaksi
**Modul**: M-02 Session Manager
**Deskripsi**: Kelompok anak dalam satu sesi. Beberapa kelompok bisa berjalan paralel di stage yang berbeda.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `session_id` | UUID | FK → sessions | Sesi induk |
| `name` | VARCHAR(80) | NOT NULL | Nama kelompok, misal "Kelompok Merah" |
| `status` | ENUM | DEFAULT 'WAITING' | `WAITING` \| `IN_PROGRESS` \| `COMPLETED` |
| `current_stage_id` | UUID | FK → session_stages, NULL | Stage yang sedang dijalani |
| `created_at` | TIMESTAMP | NOT NULL | Waktu dibuat |

**Relasi**: `session_groups` → `group_stage_progress` (detail), `participants`

---

### TD-11 · `group_stage_progress`

**Tipe**: Tabel Detail (dari `session_groups`)
**Modul**: M-03 Stage Engine
**Deskripsi**: Mencatat progres setiap kelompok di setiap stage. Ini adalah tabel yang di-polling fasilitator setiap 5 detik.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `group_id` | UUID | FK → session_groups | Kelompok |
| `session_stage_id` | UUID | FK → session_stages | Stage yang dilacak |
| `status` | ENUM | NOT NULL | `LOCKED` \| `UNLOCKED` \| `IN_PROGRESS` \| `COMPLETED` \| `SKIPPED` |
| `entered_at` | TIMESTAMP | NULL | Waktu kelompok masuk pos |
| `completed_at` | TIMESTAMP | NULL | Waktu kelompok selesai di pos |
| `unlocked_by` | UUID | FK → users, NULL | User yang melakukan unlock |
| `unlock_reason` | TEXT | NULL | Alasan override (jika non-sequential) |

**Constraint tambahan**: `UNIQUE(group_id, session_stage_id)` — satu baris per kelompok per stage.

---

### TR-12 · `participants`

**Tipe**: Tabel Transaksi
**Modul**: M-02 Session Manager · M-15 Consent
**Deskripsi**: Data peserta (anak) yang terdaftar di satu sesi. Satu anak yang ikut dua sesi akan memiliki dua baris.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `session_id` | UUID | FK → sessions | Sesi tempat terdaftar |
| `group_id` | UUID | FK → session_groups | Kelompok anak ini |
| `child_name` | VARCHAR(100) | NOT NULL | Nama lengkap anak |
| `child_age` | INT | NOT NULL | Usia dalam tahun |
| `school_name` | VARCHAR(100) | NULL | Asal sekolah |
| `parent_name` | VARCHAR(100) | NOT NULL | Nama orang tua/wali |
| `parent_phone` | VARCHAR(20) | NOT NULL | WhatsApp orang tua |
| `parent_email` | VARCHAR(255) | NULL | Email orang tua |
| `consent_recording` | BOOLEAN | DEFAULT false | Izin rekaman video/audio |
| `consent_photo` | BOOLEAN | DEFAULT false | Izin foto di raport |
| `consent_at` | TIMESTAMP | NULL | Waktu consent diberikan |
| `created_at` | TIMESTAMP | NOT NULL | Waktu terdaftar |

**Relasi**: `participants` → `assessments`, `smart_photos`, `recordings`, `reports`, `participant_missions`, `consent_logs`

---

### TD-13 · `assessments`

**Tipe**: Tabel Detail (dari `participants` + `session_stages`)
**Modul**: M-09 Assessment Module
**Deskripsi**: Nilai bintang dan komentar fasilitator per anak per stage. Upsert — satu nilai per kombinasi peserta-stage.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `participant_id` | UUID | FK → participants | Peserta yang dinilai |
| `session_stage_id` | UUID | FK → session_stages | Stage penilaian |
| `star_rating` | INT | NOT NULL, 1–5 | Nilai bintang |
| `comment` | TEXT | NULL | Komentar fasilitator (max 300 char) |
| `assessed_by` | UUID | FK → users | Fasilitator yang menilai |
| `assessed_at` | TIMESTAMP | NOT NULL | Waktu penilaian |
| `updated_at` | TIMESTAMP | NOT NULL | Waktu update terakhir |
| `sync_status` | ENUM | DEFAULT 'LOCAL' | `LOCAL` \| `SYNCED` — untuk offline tracking |

**Constraint tambahan**: `UNIQUE(participant_id, session_stage_id)` — satu nilai per anak per stage.

---

### TD-14 · `smart_photos`

**Tipe**: Tabel Detail (dari `participants`)
**Modul**: M-06 Smart Photo Module
**Deskripsi**: Foto kegiatan anak yang diambil fasilitator. Menyimpan foto asli dan foto dengan overlay frame.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `participant_id` | UUID | FK → participants | Peserta yang difoto |
| `session_id` | UUID | FK → sessions | Sesi terkait |
| `frame_id` | UUID | FK → photo_frames, NULL | Frame yang digunakan (NULL = no frame) |
| `original_file_url` | VARCHAR(500) | NOT NULL | URL foto asli (tanpa frame) |
| `framed_file_url` | VARCHAR(500) | NULL | URL foto dengan frame |
| `is_report_photo` | BOOLEAN | DEFAULT false | Dipilih sebagai foto raport |
| `taken_by` | UUID | FK → users | Fasilitator yang mengambil |
| `taken_at` | TIMESTAMP | NOT NULL | Waktu pengambilan |
| `sync_status` | ENUM | DEFAULT 'LOCAL' | `LOCAL` \| `UPLOADING` \| `SYNCED` \| `FAILED` |

**Constraint**: Maksimal 1 foto dengan `is_report_photo = true` per `participant_id` per `session_id`.

---

### TD-15 · `recordings`

**Tipe**: Tabel Detail (dari `participants`)
**Modul**: M-07 Recording Service
**Deskripsi**: Rekaman video+audio anak yang diambil fasilitator saat stage Refleksi. Menyimpan metadata, transkrip, dan hasil AI tagging.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `participant_id` | UUID | FK → participants | Peserta yang direkam |
| `session_stage_id` | UUID | FK → session_stages | Stage rekaman |
| `file_url` | VARCHAR(500) | NULL | URL file rekaman di MinIO |
| `duration_seconds` | INT | NOT NULL | Durasi rekaman (detik) |
| `file_size_bytes` | BIGINT | NULL | Ukuran file (bytes) |
| `transcript_text` | TEXT | NULL | Hasil Google Cloud STT |
| `emotion_tags_json` | JSON | NULL | `{"primary":"antusias","confidence":87}` |
| `review_status` | ENUM | DEFAULT 'PENDING' | `PENDING` \| `REVIEWED` \| `SKIPPED` |
| `reviewed_by` | UUID | FK → users, NULL | Reviewer |
| `reviewed_at` | TIMESTAMP | NULL | Waktu review |
| `sync_status` | ENUM | DEFAULT 'LOCAL' | `LOCAL` \| `UPLOADING` \| `SYNCED` \| `FAILED` |
| `created_at` | TIMESTAMP | NOT NULL | Waktu dibuat |

**Constraint**: `UNIQUE(participant_id, session_stage_id)` — satu rekaman per anak per stage (rekaman baru overwrite yang lama).

---

### TR-16 · `reports`

**Tipe**: Tabel Transaksi
**Modul**: M-10 Raport Engine
**Deskripsi**: Raport final setiap anak. Dibuat setelah semua nilai terkumpul, narasi AI digenerate dan diapprove.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `participant_id` | UUID | FK → participants, UNIQUE per session | Satu raport per peserta per sesi |
| `session_id` | UUID | FK → sessions | Sesi terkait |
| `ai_narrative_draft` | TEXT | NULL | Draft narasi dari Claude API |
| `ai_narrative_final` | TEXT | NULL | Narasi setelah diedit koordinator |
| `mission_ids_json` | JSON | NULL | Array UUID misi yang dipilih |
| `report_pdf_url` | VARCHAR(500) | NULL | URL PDF raport di MinIO |
| `parent_access_token` | VARCHAR(100) | UNIQUE | Token akses Kidversa Parent |
| `status` | ENUM | DEFAULT 'DRAFT' | `DRAFT` \| `PENDING_REVIEW` \| `APPROVED` \| `SENT` |
| `generated_at` | TIMESTAMP | NULL | Waktu raport digenerate |
| `sent_at` | TIMESTAMP | NULL | Waktu raport dikirim ke orang tua |
| `approved_by` | UUID | FK → users, NULL | Koordinator yang approve |

**Relasi**: `reports` → `participant_missions`

---

### TD-17 · `participant_missions`

**Tipe**: Tabel Detail (dari `participants` + `reports`)
**Modul**: M-11 Misi Engine
**Deskripsi**: Misi lanjutan yang dipilih per anak per raport. Orang tua menandai selesai di Kidversa Parent.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `participant_id` | UUID | FK → participants | Peserta |
| `report_id` | UUID | FK → reports | Raport terkait |
| `mission_bank_id` | UUID | FK → mission_banks | Misi dari bank |
| `is_completed` | BOOLEAN | DEFAULT false | Sudah diselesaikan orang tua? |
| `completed_at` | TIMESTAMP | NULL | Waktu ditandai selesai |

---

### TD-18 · `consent_logs`

**Tipe**: Tabel Detail (dari `participants`)
**Modul**: M-15 Consent & Privacy
**Deskripsi**: Audit trail yang tidak bisa dihapus untuk setiap pengiriman dan respons consent orang tua. Diperlukan untuk kepatuhan UU PDP.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `participant_id` | UUID | FK → participants | Peserta terkait |
| `consent_type` | ENUM | NOT NULL | `RECORDING` \| `PHOTO` |
| `value` | BOOLEAN | NOT NULL | Nilai consent yang diberikan |
| `sent_at` | TIMESTAMP | NOT NULL | Waktu link consent dikirim ke orang tua |
| `responded_at` | TIMESTAMP | NULL | Waktu orang tua merespons |
| `ip_address` | VARCHAR(45) | NULL | IP address orang tua saat submit |
| `user_agent` | TEXT | NULL | Browser info |

**Catatan**: Tabel ini bersifat append-only — tidak ada UPDATE atau DELETE. Setiap perubahan consent membuat baris baru.

---

### TD-19 · `audit_logs`

**Tipe**: Tabel Detail (dari `users`)
**Modul**: M-14 Auth & Tenant
**Deskripsi**: Audit trail untuk semua aksi penting dalam sistem — override stage, akses rekaman, perubahan nilai, dll.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `user_id` | UUID | FK → users | User yang melakukan aksi |
| `action` | VARCHAR(100) | NOT NULL | Nama aksi, misal `STAGE_OVERRIDE` |
| `resource_type` | VARCHAR(50) | NOT NULL | Tipe resource, misal `group_stage_progress` |
| `resource_id` | UUID | NULL | ID resource yang terpengaruh |
| `old_value_json` | JSON | NULL | Nilai sebelum perubahan |
| `new_value_json` | JSON | NULL | Nilai sesudah perubahan |
| `reason` | TEXT | NULL | Alasan aksi (wajib untuk override) |
| `ip_address` | VARCHAR(45) | NULL | IP address user |
| `user_agent` | TEXT | NULL | Browser info |
| `created_at` | TIMESTAMP | NOT NULL | Waktu aksi |

**Catatan**: Tabel ini bersifat append-only — tidak ada UPDATE atau DELETE.

---

### TR-20 · `sync_queue`

**Tipe**: Tabel Transaksi
**Modul**: M-16 Sync Engine
**Deskripsi**: Antrian sinkronisasi data dari perangkat fasilitator (edge/mini PC) ke cloud. Setiap item adalah satu unit data yang perlu disync.

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `tenant_id` | UUID | FK → tenants | Tenant terkait |
| `source_device_id` | VARCHAR(100) | NOT NULL | ID perangkat sumber |
| `data_type` | ENUM | NOT NULL | `ASSESSMENT` \| `PHOTO` \| `RECORDING` \| `PROGRESS` |
| `resource_id` | UUID | NOT NULL | ID resource yang disync |
| `payload_json` | JSON | NULL | Data yang akan disync (untuk data kecil) |
| `file_url_local` | VARCHAR(500) | NULL | Path file lokal (untuk foto/video) |
| `status` | ENUM | DEFAULT 'PENDING' | `PENDING` \| `IN_PROGRESS` \| `DONE` \| `FAILED` |
| `retry_count` | INT | DEFAULT 0 | Jumlah percobaan |
| `error_message` | TEXT | NULL | Pesan error jika gagal |
| `created_at` | TIMESTAMP | NOT NULL | Waktu masuk antrian |
| `synced_at` | TIMESTAMP | NULL | Waktu berhasil disync |

---

## Peta Relasi Antar Tabel

### Hirarki Master → Transaksi → Detail

```
tenants (TM)
    └── programs (TM)
    │       └── program_stages (TD)
    │               └── stage_contents (TD)
    ├── photo_frames (TM)
    └── mission_banks (TM)

sessions (TR) ← programs + tenants
    ├── session_stages (TD) ← program_stages
    ├── session_groups (TR)
    │       └── group_stage_progress (TD) ← session_stages
    └── participants (TR) ← session_groups
            ├── assessments (TD) ← session_stages
            ├── smart_photos (TD) ← photo_frames
            ├── recordings (TD) ← session_stages
            ├── reports (TR)
            │       └── participant_missions (TD) ← mission_banks
            └── consent_logs (TD)

users (TM) ← tenants
    └── audit_logs (TD)

sync_queue (TR) ← tenants
```

### Kardinalitas Utama

| Relasi | Kardinalitas | Keterangan |
|---|---|---|
| `tenants` → `programs` | 1 : N | Satu tenant punya banyak program |
| `programs` → `program_stages` | 1 : N | Satu program punya N stage |
| `program_stages` → `stage_contents` | 1 : N | Satu stage punya N file konten |
| `sessions` → `session_stages` | 1 : N | Satu sesi punya N stage aktif |
| `sessions` → `participants` | 1 : N | Satu sesi punya banyak peserta |
| `participants` → `assessments` | 1 : N | Satu peserta dinilai di N stage |
| `participants` → `reports` | 1 : 1 per sesi | Satu raport per peserta per sesi |
| `reports` → `participant_missions` | 1 : N | Satu raport punya 2–3 misi |
| `participants` → `consent_logs` | 1 : N | Banyak log consent (append-only) |

---

## Catatan Implementasi

### Indexing Rekomendasi

```sql
-- Lookup paling sering
CREATE INDEX idx_participants_session ON participants(session_id);
CREATE INDEX idx_assessments_participant ON assessments(participant_id);
CREATE INDEX idx_assessments_session_stage ON assessments(session_stage_id);
CREATE INDEX idx_gsp_group ON group_stage_progress(group_id);
CREATE INDEX idx_gsp_status ON group_stage_progress(status);
CREATE INDEX idx_sync_queue_status ON sync_queue(status, data_type);
CREATE INDEX idx_recordings_sync ON recordings(sync_status);
CREATE INDEX idx_photos_sync ON smart_photos(sync_status);
CREATE INDEX idx_reports_token ON reports(parent_access_token);

-- Multi-tenant isolation
CREATE INDEX idx_programs_tenant ON programs(tenant_id);
CREATE INDEX idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX idx_users_tenant ON users(tenant_id);
```

### Soft Delete vs Hard Delete

| Tabel | Strategi | Alasan |
|---|---|---|
| `users` | Soft delete (`is_active = false`) | User tidak bisa dihapus jika ada data terkait |
| `programs` | Soft delete (`is_active = false`) | Program tidak bisa dihapus jika ada sesi |
| `program_stages` | Soft delete | Stage tidak bisa dihapus jika ada sesi aktif |
| `photo_frames` | Soft delete | Frame tidak bisa dihapus jika sudah dipakai di foto |
| `mission_banks` | Soft delete | Misi tidak bisa dihapus jika ada di raport |
| `consent_logs` | Tidak bisa dihapus (append-only) | Audit trail regulasi UU PDP |
| `audit_logs` | Tidak bisa dihapus (append-only) | Audit trail sistem |
| `assessments`, `recordings`, `smart_photos` | Hard delete dengan batasan | Hanya bisa hapus jika raport belum `SENT` |

### Enkripsi Data Sensitif

Kolom-kolom berikut wajib dienkripsi di level aplikasi sebelum disimpan ke database:

| Tabel | Kolom | Alasan |
|---|---|---|
| `participants` | `parent_phone`, `parent_email` | Data pribadi orang tua |
| `consent_logs` | `ip_address` | Data pribadi |
| `audit_logs` | `ip_address` | Data pribadi |

File rekaman dan foto disimpan terenkripsi (AES-256) di MinIO — bukan di database.

---

*Kidversa Edutourism — ERD v1.0 | Juni 2026 | Dokumen ini bersifat internal dan confidential*
*Referensi: FSD v1.0. Perubahan schema harus diimplementasikan via Prisma migration.*

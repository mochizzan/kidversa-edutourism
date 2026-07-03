# Business Requirements Document
## Kidversa Edutourism

| | |
|---|---|
| **Nama Dokumen** | Business Requirements Document — Kidversa Edutourism |
| **Versi** | v3.0 |
| **Tanggal** | Juni 2026 |
| **Status** | Draft — Internal Review |
| **Menggantikan** | BRD v2.0 (StageLearn Platform) |
| **Perubahan utama dari v2** | Rebranding ke Kidversa Edutourism · Stage fleksibel per program · 3 antarmuka PWA (Web + Mobile + Parent) · Fitur Smart Photo (offline, Canvas API) · Recording via Kidversa Mobile · Android-first PWA · Kiosk tidak wajib |

---

## Daftar Isi

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Konteks Program Edu Wisata](#3-konteks-program-edu-wisata)
4. [Stakeholder & Pengguna](#4-stakeholder--pengguna)
5. [Tujuan Bisnis & Keberhasilan](#5-tujuan-bisnis--keberhasilan)
6. [Fitur Utama Sistem](#6-fitur-utama-sistem)
7. [Stage Learning Flow](#7-stage-learning-flow)
8. [Fitur Smart Photo](#8-fitur-smart-photo)
9. [Fitur Recording Audio & Video](#9-fitur-recording-audio--video)
10. [Sistem Penilaian & Raport](#10-sistem-penilaian--raport)
11. [Misi Lanjutan](#11-misi-lanjutan)
12. [Arsitektur Antarmuka — 3 PWA](#12-arsitektur-antarmuka--3-pwa)
13. [Modul Sistem Utama](#13-modul-sistem-utama)
14. [Spesifikasi Hardware per Pos](#14-spesifikasi-hardware-per-pos)
15. [Arsitektur Deployment — Hybrid Edge-Cloud](#15-arsitektur-deployment--hybrid-edge-cloud)
16. [Tech Stack](#16-tech-stack)
17. [Kebutuhan Non-Fungsional](#17-kebutuhan-non-fungsional)
18. [Privasi & Kepatuhan Regulasi](#18-privasi--kepatuhan-regulasi)
19. [Risiko & Mitigasi](#19-risiko--mitigasi)
20. [Decision Log](#20-decision-log)

---

## 1. Executive Summary

**Kidversa Edutourism** adalah platform pembelajaran berbasis stage yang dirancang khusus untuk program Edu Wisata — kegiatan belajar non-formal terstruktur yang berlangsung di lokasi wisata edukatif dalam satu hari penuh.

Platform ini melayani **anak usia 5–7 tahun** yang mengikuti program kunjungan terstruktur. Setiap stage pembelajaran berlangsung di pos outdoor yang berbeda, masing-masing dipandu oleh seorang fasilitator khusus. Setiap kelompok terdiri dari **5–10 anak** yang bergerak bersama dari satu pos ke pos berikutnya dalam model *station learning*.

### Diferensiator Utama

| # | Fitur | Nilai |
|---|---|---|
| 1 | **Stage Learning Fleksibel** | Jumlah dan nama stage dikonfigurasi per program — satu platform untuk berbagai jenis wisata |
| 2 | **Smart Photo** | Dokumentasi kegiatan dengan overlay frame bertema wisata — satu foto masuk raport anak |
| 3 | **Recording Audio & Video** | Asesmen autentik berbasis ekspresi dan suara anak — direkam fasilitator via smartphone |
| 4 | **Raport Personal + Narasi AI** | Setiap anak mendapat laporan terstruktur dengan narasi hangat, foto, dan misi lanjutan |
| 5 | **Misi Lanjutan** | Tugas di rumah dan sekolah — learning tidak berhenti setelah hari wisata |

### Tiga Antarmuka — Satu Backend

Kidversa Edutourism terdiri dari tiga antarmuka PWA (*Progressive Web App*) yang terhubung ke satu backend API:

- **Kidversa Web** — untuk Admin Wisata dan Koordinator Program (desktop/tablet)
- **Kidversa Mobile** — untuk Fasilitator per stage (smartphone Android, PWA)
- **Kidversa Parent** — untuk Orang Tua/Wali (mobile/web, akses via link)

Semua antarmuka dibangun dalam satu codebase **Next.js** — tidak ada distribusi APK, tidak ada App Store, update otomatis.

---

## 2. Problem Statement

| # | Permasalahan | Dampak |
|---|---|---|
| 1 | Edu Wisata sering berakhir tanpa output terukur | Tidak ada dokumentasi perkembangan anak — orang tua tidak tahu apa yang dipelajari |
| 2 | Penilaian fasilitator tidak terstandardisasi | Nilai subjektif, tidak konsisten antar fasilitator, tidak dapat dianalisis |
| 3 | Tidak ada mekanisme pembelajaran lanjutan | Pengalaman belajar berhenti di lokasi — zero follow-up ke rumah atau sekolah |
| 4 | Konten pembelajaran tidak terstruktur | Kualitas pengalaman anak bergantung fasilitator, bukan kurikulum yang dirancang |
| 5 | Tidak ada dokumentasi visual kegiatan | Tidak ada foto kenangan bermakna yang bisa dibawa pulang orang tua |
| 6 | Asesmen anak usia dini tidak autentik | Ekspresi dan respons verbal anak tidak terekam — penilaian hanya dari ingatan |

---

## 3. Konteks Program Edu Wisata

### 3.1 Gambaran Program

Program Edu Wisata adalah kegiatan pembelajaran non-formal terstruktur di area wisata edukatif (kebun, peternakan, museum, tambak, hutan, dll). Berbeda dari kunjungan wisata biasa, Edu Wisata memiliki kurikulum per pos, fasilitator terlatih, dan output berupa raport untuk setiap anak.

### 3.2 Karakteristik Utama

| Aspek | Detail |
|---|---|
| **Lokasi** | Outdoor di area wisata — pos dapat berpindah-pindah |
| **Durasi** | Satu hari penuh — semua stage diselesaikan dalam satu sesi |
| **Usia peserta** | 5–7 tahun (pra-sekolah hingga kelas 1 SD) |
| **Kapasitas** | 5–10 anak per kelompok per stage |
| **Fasilitator** | 1 fasilitator khusus per stage + 1 koordinator program |
| **Model** | Station learning — kelompok bergerak dari satu pos ke pos berikutnya |
| **Listrik** | Tersedia di semua pos |
| **Jaringan** | WiFi portable router + LAN kabel sebagai fallback |

### 3.3 Model Station Learning

```
[Kelompok A] ──► [Pos Stage 1] ──► [Pos Stage 2] ──► ... ──► [Pos Stage N]
[Kelompok B]          │                  │                         │
[Kelompok C]     (Fasilitator 1)   (Fasilitator 2)          (Fasilitator N)
                 Kidversa Mobile    Kidversa Mobile          Kidversa Mobile
```

Beberapa kelompok dapat menjalani program secara bersamaan di pos yang berbeda. Perpindahan antar pos dikoordinasikan oleh koordinator dari Kidversa Web.

### 3.4 Fleksibilitas Program

Berbeda dari BRD v1 dan v2, **jumlah stage tidak lagi hardcoded**. Setiap program Edu Wisata di setiap lokasi wisata dapat memiliki jumlah dan nama stage yang berbeda:

| Contoh Program | Lokasi | Jumlah Stage | Contoh Nama Stage |
|---|---|---|---|
| Belajar Bertani | Kebun Edukasi | 4 stage | Sapa Profesi · Games · Modern vs Tradisional · Refleksi |
| Mengenal Laut | Tambak Wisata | 5 stage | Sapa Laut · Eksplorasi · Tangkap & Lepas · Kreasi · Refleksi |
| Petualangan Hutan | Ekowisata | 6 stage | Sapa Hutan · Identifikasi · Games · Eksperimen · Kreasi · Refleksi |

Admin Wisata mendefinisikan semua ini dari Backoffice — Kidversa Engine mengeksekusi sesuai konfigurasi.

---

## 4. Stakeholder & Pengguna

| Peran | Deskripsi | Antarmuka | Akses |
|---|---|---|---|
| **Super Admin** | Tim platform — kelola tenant, konfigurasi global | Kidversa Web | Full system |
| **Admin Wisata** | Pengelola lokasi wisata — setup program, kelola fasilitator, upload konten & frame | Kidversa Web | Tenant scope |
| **Koordinator Program** | Mengelola sesi hari-H — monitor kelompok, atur perpindahan, unlock darurat | Kidversa Web | Sesi aktif |
| **Fasilitator Stage** | Pemandu per pos — entry nilai, komentar, recording, smart photo, advance stage | Kidversa Mobile | Stage ditugaskan |
| **Anak (5–7 tahun)** | Peserta — melihat konten di monitor pos, mengikuti arahan fasilitator | Learner Interface (bagian dari Kidversa Web, di monitor pos) | Hanya konten stage aktif |
| **Orang Tua/Wali** | Consent + penerima raport | Kidversa Parent | Raport & misi anak sendiri |

> **Catatan penting**: Anak usia 5–7 tahun **tidak memegang perangkat**. Fasilitator mengoperasikan semua perangkat. Anak hanya mengikuti arahan dan melihat konten di layar monitor pos.

---

## 5. Tujuan Bisnis & Keberhasilan

| Tujuan | Metrik Target | Timeline |
|---|---|---|
| Raport terkirim ke semua orang tua | 100% anak menerima raport H+0 atau H+1 | Post-launch |
| Kepuasan orang tua | ≥85% menilai raport "informatif dan bermanfaat" | 3 bulan |
| Keterlibatan misi | ≥60% orang tua laporkan anak selesaikan ≥1 misi | 6 bulan |
| Konsistensi penilaian | Inter-rater reliability fasilitator ≥0.75 (Cohen's κ) | 6 bulan |
| Adopsi lokasi wisata | ≥5 lokasi aktif menggunakan platform | 12 bulan |
| Keandalan sistem | Zero sesi gagal karena masalah teknis | Ongoing |
| Kepatuhan privasi | Zero incident data anak — 100% consent terdokumentasi | Ongoing |

---

## 6. Fitur Utama Sistem

Kidversa Edutourism memiliki **5 fitur utama** yang membentuk proposisi nilai platform:

### F-01 · Kelola Kelas & Sesi

Manajemen lengkap program Edu Wisata dari Backoffice:
- Buat dan kelola **program** (nama wisata, jumlah stage, konten per stage)
- Buat dan kelola **sesi** (tanggal, lokasi, fasilitator per stage)
- Buat dan kelola **kelompok** (daftar anak per kelompok, nomor sesi)
- Koordinator monitor semua kelompok secara real-time dari satu dashboard

### F-02 · Penilaian (N Stage)

Sistem penilaian berbasis bintang yang fleksibel:
- Jumlah stage dikonfigurasi per program (tidak hardcoded)
- Fasilitator input nilai bintang 1–5 per anak per stage via Kidversa Mobile
- Fasilitator tulis komentar singkat per anak sebagai konteks penilaian
- Mekanisme sequential (default) dan non-sequential (kasus khusus via Backoffice)

### F-03 · Recording Audio & Video

Rekaman respons verbal dan ekspresi anak:
- Direkam oleh fasilitator via **Kidversa Mobile** (smartphone Android)
- Kamera belakang smartphone diarahkan ke wajah anak
- Durasi 60–90 detik per anak
- Tersimpan lokal di device → sync ke backend saat koneksi tersedia

### F-04 · Smart Photo

Dokumentasi visual kegiatan dengan sentuhan tema wisata:
- Fasilitator ambil foto kegiatan via Kidversa Mobile
- Overlay frame bertema wisata menggunakan **Canvas API** — sepenuhnya offline
- Satu foto terpilih dapat dimasukkan ke raport anak (consent-based)
- Admin Wisata kelola library frame di Backoffice

### F-05 · Generate Raport

Laporan personal otomatis untuk setiap anak:
- Identitas anak + foto Smart Photo (consent-based)
- Penilaian bintang per stage + komentar fasilitator
- Narasi AI (Claude API) — direview fasilitator sebelum dikirim
- Misi lanjutan yang dipersonalisasi berdasarkan profil nilai
- Output: PDF — dikirim via WhatsApp/email ke orang tua

---

## 7. Stage Learning Flow

### 7.1 Konsep Stage Fleksibel

Stage di Kidversa Edutourism bersifat **data-driven** — jumlah, nama, tujuan, dan konten setiap stage ditentukan oleh Admin Wisata di Backoffice, bukan dikodekan di sistem. Ini memungkinkan satu platform melayani berbagai jenis program wisata edukatif.

**Batasan konfigurasi stage:**
- Minimum: 1 stage
- Rekomendasi default: 4 stage
- Tidak ada batas maksimum — namun disarankan ≤8 stage untuk menjaga fokus anak usia 5–7 tahun

### 7.2 Desain Konten untuk Anak 5–7 Tahun

Seluruh konten stage dirancang berdasarkan prinsip **pre-operational learning** (Piaget):

- **Teks minimal** — semua instruksi menggunakan ikon besar + narasi audio
- **Visual dominan** — gambar, animasi, video mendominasi setiap tampilan
- **Hook 10 detik** — pembuka setiap stage harus langsung menarik perhatian
- **Warna cerah, saturasi tinggi** — anak usia ini merespons warna lebih kuat
- **Touch target minimal 80×80px** — jari anak lebih besar, presisi sentuhan belum sempurna
- **Durasi per stage** — maksimal 15 menit (dapat dikonfigurasi per konten)

### 7.3 Mekanisme Perpindahan Stage

#### Mode Default — Sequential

```
Fasilitator Kidversa Mobile → klik "Kelompok Selesai"
          ↓
Backend update: Kelompok A → Stage N = ✓
          ↓
Tablet koordinator (Kidversa Web) tampilkan notifikasi
          ↓
Koordinator konfirmasi → Fasilitator Stage N+1 terima kelompok
```

Komunikasi antar pos menggunakan **polling ke backend/database** — tablet fasilitator mengecek status setiap beberapa detik. Tidak menggunakan WebSocket untuk menjaga kesederhanaan dan keandalan di jaringan lokal.

#### Mode Kasus Khusus — Non-Sequential

Koordinator atau Admin Wisata dapat mengatur dari Backoffice:
- Skip stage tertentu (cuaca buruk, keterbatasan waktu)
- Ubah urutan stage untuk kelompok tertentu
- Unlock stage manual untuk situasi darurat
- Reset progres kelompok jika terjadi gangguan teknis

### 7.4 Learner Interface (Monitor Pos)

Layar yang ditampilkan di monitor setiap pos adalah **kiosk mode full-screen**:
- Tidak ada navigasi, menu, atau tombol apapun selain konten stage aktif
- Anak hanya melihat konten — tidak mengoperasikan perangkat
- Dikontrol sepenuhnya oleh fasilitator via Kidversa Mobile
- Diakses melalui Kidversa Web di browser monitor pos

---

## 8. Fitur Smart Photo

### 8.1 Deskripsi

Smart Photo adalah fitur dokumentasi visual kegiatan yang memungkinkan fasilitator mengambil foto anak selama sesi, menambahkan frame bertema wisata, dan menyimpan hasilnya sebagai kenangan serta lampiran raport.

### 8.2 Alur Penggunaan

```
1. Fasilitator buka fitur Smart Photo di Kidversa Mobile
        ↓
2. Pilih anak yang akan difoto dari daftar kelompok
        ↓
3. Ambil foto menggunakan kamera belakang smartphone
        ↓
4. Preview foto — pilih frame dari library tema program
        (frame tersedia offline — sudah di-cache saat install PWA)
        ↓
5. Canvas API overlay frame di atas foto — hasil real-time
        ↓
6. Simpan foto (lokal di device) → sync ke backend saat koneksi ada
        ↓
7. Di Backoffice — koordinator/fasilitator tandai 1 foto
   sebagai "foto raport" per anak (opsional, consent-based)
```

### 8.3 Spesifikasi Teknis Smart Photo

| Aspek | Spesifikasi |
|---|---|
| **Rendering frame** | Canvas API — sepenuhnya di browser, tanpa API eksternal |
| **Mode offline** | 100% offline-capable — foto + frame + overlay tanpa koneksi |
| **Format output** | JPEG/PNG, resolusi disesuaikan ukuran layar (max 1920×1080) |
| **Library frame** | Di-bundle dalam PWA service worker cache saat install |
| **Update frame** | Admin Wisata upload frame baru di Backoffice → sync ke cache device saat konek |
| **Storage lokal** | Tersimpan di IndexedDB device fasilitator → upload ke MinIO backend saat sync |
| **Frame per program** | Admin Wisata assign frame tertentu per program wisata |

### 8.4 Manajemen Frame di Backoffice

Admin Wisata mengelola library frame dari Backoffice:
- Upload file PNG frame (transparansi/alpha channel) per tema wisata
- Assign frame ke program tertentu (misal: frame "Kebun" untuk program Belajar Bertani)
- Preview frame sebelum dipublikasikan
- Nonaktifkan frame lama tanpa menghapus foto yang sudah menggunakannya

### 8.5 Foto di Raport

- Hanya satu foto per anak yang ditampilkan di raport
- **Wajib ada consent foto** dari orang tua sebelum foto ditampilkan di raport
- Jika consent tidak ada → raport tetap lengkap, foto diganti ilustrasi placeholder
- Foto asli (tanpa frame) tetap tersimpan di galeri sesi di Backoffice

---

## 9. Fitur Recording Audio & Video

### 9.1 Deskripsi

Fitur Recording memungkinkan fasilitator merekam respons verbal dan ekspresi wajah anak sebagai bahan asesmen autentik. Rekaman dilakukan oleh fasilitator menggunakan Kidversa Mobile — bukan anak yang merekam diri sendiri.

### 9.2 Alur Recording

```
1. Fasilitator pilih anak yang akan direkam di Kidversa Mobile
        ↓
2. Fasilitator bacakan pertanyaan refleksi
   (tampil di layar Kidversa Mobile sebagai panduan)
        ↓
3. Fasilitator arahkan kamera belakang smartphone ke wajah anak
   Jarak optimal: 50–80 cm
        ↓
4. Fasilitator tap "Mulai Rekam"
        ↓
5. Anak menjawab pertanyaan — durasi 60–90 detik
        ↓
6. Fasilitator tap "Selesai" → preview singkat
        ↓
7. Submit → tersimpan di IndexedDB (lokal) → upload ke MinIO saat koneksi ada
```

### 9.3 Spesifikasi Teknis Recording

| Aspek | Spesifikasi |
|---|---|
| **API Browser** | MediaRecorder API (standard di Chrome Android) |
| **Format output** | WebM (Chrome) — konversi MP4 di backend jika diperlukan |
| **Resolusi video** | 720p (1280×720) — cukup untuk analisis ekspresi, ukuran file manageable |
| **Durasi** | Maksimal 90 detik per anak (dapat dikonfigurasi) |
| **Ukuran file** | ~15–20 MB per rekaman (720p, 90 detik) |
| **Storage lokal** | IndexedDB → upload via queue saat koneksi tersedia |
| **Platform** | Android Chrome (primary) · iOS Safari (supported, tanpa background sync) |
| **Enkripsi** | AES-256 di storage lokal dan cloud |

### 9.4 Review Rekaman di Backoffice

Setelah rekaman tersync ke backend:

```
Koordinator/fasilitator buka Backoffice
        ↓
Lihat daftar rekaman yang belum direview
        ↓
Putar video + baca transkrip otomatis (Google Cloud STT — Bahasa Indonesia)
        ↓
Lihat AI tagging ekspresi awal: Antusias / Ragu / Bingung / Netral
        ↓
Override tag jika perlu + konfirmasi penilaian bintang
        ↓
Nilai final tersimpan → terhubung ke raport
```

### 9.5 Panduan Teknis Recording Outdoor

- **Pencahayaan**: Posisikan anak membelakangi sumber cahaya — wajah terkena cahaya, hindari backlit
- **Jarak mikrofon**: 50–80 cm antara smartphone dan anak
- **Noise**: Setup area semi-tertutup (backdrop kain, partisi lipat) untuk meminimalkan noise angin
- **Privasi**: Rekaman hanya diambil jika **consent rekaman** dari orang tua sudah diterima

---

## 10. Sistem Penilaian & Raport

### 10.1 Skala Penilaian Bintang

Fasilitator memberikan nilai bintang 1–5 untuk setiap anak di setiap stage:

| Bintang | Label | Deskripsi |
|---|---|---|
| ⭐ | Belum terlihat | Belum menunjukkan pemahaman — perlu bimbingan penuh |
| ⭐⭐ | Mulai berkembang | Mulai memahami — masih perlu dorongan fasilitator |
| ⭐⭐⭐ | Cukup baik | Aktif berpartisipasi — mengikuti arahan dengan baik |
| ⭐⭐⭐⭐ | Sangat baik | Antusias dan responsif — pemahaman kuat |
| ⭐⭐⭐⭐⭐ | Luar biasa | Melampaui ekspektasi — memimpin dan membantu teman |

Selain bintang, fasilitator mengisi **komentar singkat** (1–3 kalimat) per stage sebagai konteks kualitatif.

### 10.2 Struktur Raport

| Seksi | Konten | Kondisi |
|---|---|---|
| **Identitas** | Nama, usia, asal sekolah, kelompok, program, tanggal | Selalu ada |
| **Foto Smart Photo** | Foto anak dengan frame tema wisata | Hanya jika consent foto ✓ |
| **Penilaian per Stage** | Bintang + komentar fasilitator untuk setiap stage | Selalu ada |
| **Narasi AI** | Paragraf 3–5 kalimat, hangat dan encouraging | Setelah review fasilitator |
| **Misi Lanjutan** | 2–3 tugas di rumah, orang tua, dan sekolah | Selalu ada |
| **Penutup** | Nama koordinator, logo wisata, kontak | Selalu ada |

### 10.3 Alur Generate Raport

```
1. Fasilitator input semua nilai + komentar via Kidversa Mobile
        ↓
2. Koordinator verifikasi kelengkapan nilai di Backoffice
        ↓
3. Backend kirim data ke Claude API → generate draft narasi AI
        (Hanya saat koneksi internet tersedia)
        ↓
4. Koordinator/fasilitator review + edit narasi di Backoffice
        ↓
5. Approve → sistem generate PDF raport
        ↓
6. Kirim ke orang tua via WhatsApp / email (Kidversa Parent)
        ↓
7. Link raport tersimpan — dapat diakses kapan saja
```

> **Catatan edge mode**: Narasi AI membutuhkan koneksi ke Claude API. Saat offline, nilai dan komentar disimpan lokal. Narasi digenerate saat sync ke cloud di akhir sesi. Raport dikirim ke orang tua H+0 (sore) atau H+1 maksimal.

### 10.4 Format & Distribusi Raport

| Format | Keterangan |
|---|---|
| **PDF digital** | Dikirim via WhatsApp atau email — default |
| **Link online** | URL unik per anak di Kidversa Parent |
| **Cetak** | Jika ada printer di lokasi — opsional |

---

## 11. Misi Lanjutan

### 11.1 Tujuan

Misi lanjutan memastikan pembelajaran tidak berhenti di lokasi wisata. Setiap anak mendapat 2–3 tugas sederhana yang dapat dilakukan setelah hari wisata, melibatkan orang tua dan guru.

### 11.2 Kategori Misi

| Kategori | Contoh (Belajar Bertani) |
|---|---|
| **Di rumah** | Tanam kacang hijau di gelas plastik, amati 5 hari |
| **Bersama orang tua** | Kunjungi pasar, tanyakan sayuran dari mana asalnya |
| **Di sekolah** | Ceritakan kepada teman apa yang dipelajari hari ini |

### 11.3 Pemilihan Misi

- Admin Wisata membuat **bank misi** per program (15–20 misi per program)
- AI (Claude API) memilih 2–3 misi yang paling relevan berdasarkan **profil nilai anak** — prioritas area dengan nilai terendah
- Koordinator/Admin dapat override pilihan AI secara manual

### 11.4 Tampilan di Kidversa Parent

- Versi **anak**: kalimat pendek, sederhana, positif — dibacakan orang tua
- Versi **orang tua**: penjelasan tujuan pedagogis misi
- Orang tua dapat **tandai misi selesai** di Kidversa Parent

---

## 12. Arsitektur Antarmuka — 3 PWA

### 12.1 Konsep

Tiga antarmuka Kidversa Edutourism dibangun dalam **satu codebase Next.js** sebagai Progressive Web App (PWA). Tidak ada distribusi APK, tidak ada App Store — fasilitator dan orang tua cukup membuka browser dan menginstall ke homescreen.

```
┌─────────────────────────────────────────────────────┐
│              SATU BACKEND API (NestJS)              │
│                                                     │
│  Kidversa Web    Kidversa Mobile    Kidversa Parent  │
│  (Next.js PWA)   (Next.js PWA)      (Next.js PWA)   │
│  Desktop/tablet  Smartphone         Mobile/web      │
│  Admin · Koord.  Fasilitator        Orang tua       │
└─────────────────────────────────────────────────────┘
```

### 12.2 Kidversa Web

**Target pengguna**: Admin Wisata, Koordinator Program
**Device**: Desktop, laptop, tablet
**Akses**: Browser biasa — tidak perlu install

| Modul | Fitur |
|---|---|
| Program Manager | Buat program, define N stage, set nama & konten per stage |
| Session Manager | Buat sesi, assign fasilitator per stage, kelola kelompok & daftar anak |
| Content Manager | Upload konten stage (video, gambar, audio, game assets) |
| Frame Manager | Upload & kelola library frame Smart Photo per program |
| Live Monitor | Dashboard real-time semua kelompok — status di stage mana, sudah selesai/belum |
| Stage Controller | Konfirmasi perpindahan kelompok, unlock darurat, reset progres |
| Recording Review | Review rekaman anak, AI tagging ekspresi, approve/override nilai |
| Raport Manager | Review narasi AI, approve, generate PDF, kirim ke orang tua |
| Analytics | Statistik per sesi, rekap nilai, export data |
| Learner Interface | Tampilan kiosk full-screen untuk monitor pos (route khusus) |

### 12.3 Kidversa Mobile

**Target pengguna**: Fasilitator per stage
**Device**: Smartphone Android (primary), iOS (supported)
**Akses**: PWA — install via Chrome → Add to Home Screen
**Prinsip**: Semua yang dibutuhkan fasilitator selama sesi ada di satu app

| Modul | Fitur |
|---|---|
| Dashboard Fasilitator | Lihat sesi aktif, stage yang ditugaskan, daftar kelompok masuk |
| Daftar Anak | Kelompok aktif, nama anak, status nilai per stage |
| Entry Nilai | Input bintang 1–5 per anak, tulis komentar |
| Smart Photo | Buka kamera, overlay frame, simpan foto per anak |
| Recording | Buka kamera + mikrofon, rekam video+audio anak, submit |
| Stage Control | Tandai kelompok "selesai" → trigger perpindahan ke stage berikutnya |
| Offline Mode | Semua fitur di atas bekerja tanpa koneksi — sync otomatis saat ada internet |

**PWA Capabilities di Android Chrome:**

| Kemampuan | Status |
|---|---|
| Install ke homescreen | ✅ Prompt otomatis |
| Offline mode | ✅ Penuh via Service Worker + IndexedDB |
| Akses kamera & mikrofon | ✅ MediaDevices.getUserMedia |
| Recording audio+video | ✅ MediaRecorder API |
| Canvas API (Smart Photo) | ✅ Penuh |
| Background sync | ✅ Background Sync API |
| Push notification | ✅ Web Push API |

**Known limitation iOS Safari:**
- Background sync tidak didukung → sync terjadi saat app dibuka (bukan di background)
- Storage limit lebih ketat untuk offline data
- Bukan prioritas utama — iOS tetap dapat diakses, fitur inti berjalan normal

### 12.4 Kidversa Parent

**Target pengguna**: Orang tua / wali
**Device**: Smartphone (mobile web atau PWA)
**Akses**: Link dari WhatsApp/email — tidak wajib install

| Modul | Fitur |
|---|---|
| Consent | Berikan consent rekaman dan/atau foto anak |
| Raport | Lihat dan download raport PDF anak |
| Smart Photo | Lihat foto kegiatan anak dengan frame |
| Misi | Lihat misi lanjutan, tandai selesai |
| Profil | Data anak, riwayat program yang pernah diikuti |

---

## 13. Modul Sistem Utama

| ID | Modul | Deskripsi | Antarmuka | Layer |
|---|---|---|---|---|
| M-01 | Program Manager | Buat dan kelola program — define N stage, nama, tujuan, konten per stage | Web | Backend |
| M-02 | Session Manager | Buat sesi, assign fasilitator, kelola kelompok & daftar anak | Web | Backend |
| M-03 | Stage Engine | Logika urutan stage, sequential/non-sequential, status kelompok, polling API | All | Backend |
| M-04 | Learner Interface | Tampilan kiosk full-screen di monitor pos — hanya konten stage aktif | Web | Frontend |
| M-05 | Fasilitator Module | Entry nilai, komentar, advance stage, lihat daftar anak | Mobile | Frontend |
| M-06 | Smart Photo Module | Kamera, Canvas overlay frame, simpan lokal, sync ke backend | Mobile | Frontend |
| M-07 | Recording Service | MediaRecorder API, simpan lokal IndexedDB, upload queue ke MinIO | Mobile + Backend | Frontend + Backend |
| M-08 | Reflection Analyzer | Review rekaman di Backoffice, Google Cloud STT, AI tagging ekspresi | Web | Backend + AI |
| M-09 | Assessment Module | Terima nilai bintang + komentar, validasi kelengkapan, hitung agregat | All | Backend |
| M-10 | Raport Engine | Kumpulkan data → Claude API narasi → susun PDF → kirim | Web + Backend | Backend + AI |
| M-11 | Misi Engine | Bank misi per program, AI pilih berdasarkan profil nilai, tampil di Parent | Web + Parent | Backend + AI |
| M-12 | Frame Manager | Upload & kelola library frame Smart Photo per program di Backoffice | Web | Backend |
| M-13 | Content Manager | Upload & kelola konten stage (video, gambar, audio, game assets) | Web | Backend |
| M-14 | Auth & Tenant | Multi-tenant per lokasi wisata, RBAC (Super Admin, Admin, Koordinator, Fasilitator) | All | Backend |
| M-15 | Consent & Privacy | Kelola consent orang tua, audit log akses data anak, graceful degradation | All | Backend |
| M-16 | Sync Engine | Queue sinkronisasi data dari edge (device/mini PC) ke cloud — retry, conflict resolution | All | Backend |
| M-17 | Notification Service | Kirim raport via WhatsApp/email, notifikasi internal | Backend | Backend |
| M-18 | Reporting & Analytics | Dashboard progres, statistik nilai, export data per sesi/program | Web | Backend |

---

## 14. Spesifikasi Hardware per Pos

### 14.1 Prinsip Umum

- Semua pos bersifat **mobile** — dapat dipindah sesuai kebutuhan lokasi
- **Listrik tersedia** di semua pos
- **Kiosk tidak wajib** — fasilitator menggunakan smartphone pribadi (Android)
- Satu **mini PC** per lokasi (bukan per pos) sebagai server lokal

### 14.2 Kebutuhan Hardware per Pos

| Komponen | Spesifikasi | Fungsi |
|---|---|---|
| **Monitor pos** | 43" portabel, brightness ≥500 nit (outdoor), stand/tripod | Learner Interface — konten ditampilkan ke semua anak |
| Monitor Stage 2 (Games) | 43" **touchscreen** portabel | Anak berinteraksi langsung dengan game |
| **Smartphone fasilitator** | Android, Chrome terbaru, kamera belakang ≥8MP, storage ≥32GB | Kidversa Mobile — nilai, smart photo, recording |
| **Speaker Bluetooth** | Portabel, output ≥10W | Audio konten stage |
| **Power strip** | 4–6 slot, kabel ekstensi ≥10m | Listrik ke monitor |
| **Koneksi monitor** | HDMI dari mini PC atau Miracast dari tablet/laptop koordinator | Mirror konten ke layar besar |

### 14.3 Infrastruktur per Lokasi

| Komponen | Spesifikasi | Fungsi |
|---|---|---|
| **Mini PC (server lokal)** | Intel Core i3 Gen 12+, 8GB RAM, 256GB SSD, Ubuntu LTS 24.04 | Backend NestJS + MySQL + MinIO berjalan lokal |
| **WiFi portable router** | Dual-band, coverage ≥50m outdoor | Jaringan lokal antar semua perangkat |
| **Switch LAN** | 8 port (opsional) | Koneksi kabel lebih stabil jika tersedia |
| **Tablet koordinator** | 10–13", Android/iPad | Kidversa Web — monitor semua kelompok |

### 14.4 Estimasi Biaya Hardware (1 Lokasi, 4 Pos Default)

| Item | Estimasi | Qty | Total |
|---|---|---|---|
| Monitor 43" portabel non-touch | Rp 3–6 juta | 3 | Rp 9–18 juta |
| Monitor 43" touchscreen portabel | Rp 8–20 juta | 1 | Rp 8–20 juta |
| Smartphone Android fasilitator | Rp 2–5 juta | 4 | Rp 8–20 juta |
| Tablet koordinator | Rp 3–8 juta | 1 | Rp 3–8 juta |
| Mini PC server lokal | Rp 2,5–4 juta | 1 | Rp 2,5–4 juta |
| Speaker Bluetooth portabel | Rp 300–800 ribu | 4 | Rp 1,2–3,2 juta |
| WiFi router portabel | Rp 500 ribu–1,5 juta | 1 | Rp 0,5–1,5 juta |
| Aksesori (kabel, power strip, stand, dll) | — | — | Rp 1–2 juta |
| **Total estimasi** | | | **Rp 33–77 juta** |

> Dibandingkan BRD v2 yang memerlukan kiosk khusus (Rp 15–50 juta per unit), penggunaan smartphone fasilitator menekan biaya hardware secara signifikan.

---

## 15. Arsitektur Deployment — Hybrid Edge-Cloud

### 15.1 Konsep

Kidversa Edutourism menggunakan arsitektur **Hybrid Edge-Cloud** — sistem beroperasi penuh dengan maupun tanpa koneksi internet, dengan sinkronisasi otomatis ke cloud setelah sesi selesai.

```
┌───────────────────────────────────────────────────────────┐
│                  LOKASI WISATA (EDGE)                     │
│                                                           │
│  [Smartphone Fasilitator 1..N]   [Tablet Koordinator]    │
│  Kidversa Mobile PWA             Kidversa Web             │
│           │                            │                  │
│           └───────────┬────────────────┘                  │
│                       │ WiFi / LAN lokal                  │
│                  [Mini PC]                                 │
│          NestJS API · MySQL · MinIO                       │
│                  Ubuntu LTS                               │
│                       │                                   │
└───────────────────────│───────────────────────────────────┘
                        │ Internet (jika tersedia)
                        ▼
┌───────────────────────────────────────────────────────────┐
│                        CLOUD                              │
│    NestJS API · MySQL · Object Storage (S3-compatible)   │
│    Claude API · Google Cloud STT                         │
│    Kidversa Web (Backoffice remote) · Kidversa Parent    │
└───────────────────────────────────────────────────────────┘
```

### 15.2 Mode Operasi

#### Mode Cloud (Internet Tersedia)
- Semua perangkat (smartphone fasilitator, tablet koordinator) berkomunikasi langsung ke cloud backend
- Data nilai, progress, foto, rekaman tersimpan real-time di cloud
- Koordinator dapat monitor dari mana saja
- Narasi AI dapat digenerate segera setelah sesi selesai
- Mini PC standby sebagai fallback

#### Mode Edge (Internet Terbatas / Tidak Ada)
- Sistem **auto-detect**: tidak bisa ping cloud dalam 10 detik → switch ke mode edge
- Mini PC berjalan sebagai backend identik dengan cloud
- Semua fungsi sesi berjalan normal: stage engine, penilaian, smart photo, recording
- Narasi AI tidak dapat digenerate (butuh Claude API) → draft raport tanpa narasi disimpan
- Konten stage, frame Smart Photo sudah di-cache di service worker PWA

### 15.3 Sinkronisasi di Akhir Sesi

```
1. Sync Engine deteksi koneksi internet aktif
        ↓
2. Upload data DB (nilai, progress, log) → cloud MySQL
        ↓
3. Upload foto Smart Photo → cloud object storage (background)
        ↓
4. Upload video rekaman → cloud object storage (background)
        ↓
5. Cloud verifikasi kelengkapan data
        ↓
6. Generate narasi AI (Claude API) → review Backoffice
        ↓
7. Generate & kirim raport PDF ke orang tua
        ↓
8. Konfirmasi sync → mini PC tandai data sebagai "synced"
```

**Conflict resolution**: Last-write-wins berdasarkan timestamp — data lokal (edge) prioritas untuk sesi aktif.

### 15.4 Estimasi Storage

| Data | Per Sesi (10 anak) |
|---|---|
| Data DB (nilai, progress, log) | ~1 MB |
| Foto Smart Photo (10 anak, 1–3 foto/anak) | ~5–15 MB |
| Video rekaman (720p, 90 detik × 10 anak) | ~150–200 MB |
| **Total per sesi** | **~160–220 MB** |
| Mini PC 256GB (konten stage ~5GB tetap) | **~1.100 sesi buffer** |

---

## 16. Tech Stack

### 16.1 Stack Utama

| Layer | Teknologi | Versi | Keterangan |
|---|---|---|---|
| **Frontend — semua antarmuka** | Next.js | 14+ (App Router) | SSR untuk Web, PWA untuk Mobile dan Parent |
| **Styling** | Tailwind CSS | 3+ | Utility-first, kontrol penuh UI kiosk dan mobile |
| **Smart Photo rendering** | Canvas API | Browser native | Overlay frame tanpa library eksternal, offline |
| **Recording** | MediaRecorder API | Browser native | Audio+video di Chrome Android |
| **Offline storage** | IndexedDB + Service Worker | Browser native | Cache konten, foto, rekaman sebelum sync |
| **Backend API** | NestJS | 10+ | TypeScript, modular, ringan di mini PC |
| **ORM** | Prisma | 5+ | Type-safe, schema identik di edge dan cloud |
| **Database** | MySQL | 8.0+ | Relasional, identik di mini PC dan cloud |
| **Object Storage** | MinIO (lokal) → S3-compatible (cloud) | Latest | Satu kode upload untuk dua environment |
| **OS** | Ubuntu LTS | 24.04 | Identik di mini PC dan cloud |
| **Container** | Docker + Docker Compose | Latest | Satu file compose untuk lokal dan cloud |

### 16.2 Layanan Eksternal

| Layanan | Provider | Fungsi |
|---|---|---|
| **AI Narasi Raport** | Claude API (claude-sonnet-4-6) | Generate narasi raport + pilih misi lanjutan |
| **Speech-to-Text** | Google Cloud STT | Transkrip rekaman refleksi (Bahasa Indonesia) |
| **PDF Generator** | Puppeteer via NestJS | Render raport HTML ke PDF |
| **Messaging** | WhatsApp Business API + SMTP | Kirim raport ke orang tua |
| **Cloud Hosting** | VPS / cloud provider | Backup cloud backend |

### 16.3 Struktur Monorepo

```
kidversa/
├── apps/
│   ├── web/              # Next.js — Kidversa Web (Admin, Koordinator, Learner Interface)
│   ├── mobile/           # Next.js PWA — Kidversa Mobile (Fasilitator)
│   ├── parent/           # Next.js PWA — Kidversa Parent (Orang Tua)
│   └── api/              # NestJS — Backend API
├── packages/
│   ├── ui/               # Shared Tailwind components
│   ├── types/            # Shared TypeScript types
│   └── prisma/           # Shared Prisma schema & migrations
└── docker-compose.yml    # Identik untuk edge (mini PC) dan cloud
```

---

## 17. Kebutuhan Non-Fungsional

| Aspek | Kebutuhan | Prioritas |
|---|---|---|
| **Offline reliability** | Semua fitur fasilitator (nilai, smart photo, recording) harus berjalan 100% tanpa internet | Kritis |
| **PWA installability** | Kidversa Mobile harus dapat diinstall di homescreen Android — install prompt otomatis | Kritis |
| **Smart Photo offline** | Foto + frame overlay + simpan harus berjalan tanpa koneksi — Canvas API + Service Worker cache | Kritis |
| **Recording quality** | Video 720p minimal, audio jernih untuk analisis ekspresi | Tinggi |
| **Sync reliability** | Sync engine retry otomatis — tidak ada data hilang setelah sesi | Tinggi |
| **Response time edge** | API response di mini PC lokal <500ms untuk semua operasi sesi | Tinggi |
| **PWA bundle size** | Kidversa Mobile bundle <10MB agar cepat di-load di jaringan terbatas | Tinggi |
| **UI mobile** | Touch target ≥80×80px, warna saturasi tinggi, narasi audio untuk instruksi anak | Tinggi |
| **Multi-kelompok** | Sistem support minimal 5 kelompok simultan di N pos tanpa degradasi | Sedang |
| **Raport generation** | PDF raport digenerate dalam <30 detik setelah semua data tersedia | Sedang |
| **iOS compatibility** | Kidversa Mobile dapat diakses di Safari iOS — fitur inti berjalan, background sync tidak tersedia | Sedang |

---

## 18. Privasi & Kepatuhan Regulasi

### 18.1 Kerangka Regulasi

- **UU PDP Indonesia (2024)** — data anak di bawah 13 tahun masuk kategori sensitif tertinggi
- **COPPA & GDPR-K** — kompatibel sebagai referensi standar internasional

### 18.2 Jenis Consent Orang Tua

| Consent | Timing | Tanpa Consent |
|---|---|---|
| Consent partisipasi program | Saat pendaftaran rombongan (H-3 atau lebih awal) | Anak tidak dapat mengikuti program |
| Consent recording audio+video | H-2 via WhatsApp/email | Fitur recording dinonaktifkan — sesi tetap berjalan normal |
| Consent foto di raport | H-2 bersamaan dengan consent recording | Foto tidak tampil di raport — placeholder digunakan |

### 18.3 Prinsip Penanganan Data

- Rekaman dan foto disimpan **terenkripsi (AES-256)** di semua lokasi
- **Retensi**: maksimal 1 tahun akademik sejak tanggal sesi → auto-delete
- Rekaman **tidak boleh digunakan** untuk training model AI tanpa consent terpisah
- Setiap akses ke rekaman/foto anak dicatat di **audit log** (siapa, kapan, dari IP mana)
- Orang tua memiliki **hak akses dan hak hapus** data anak kapan saja melalui Kidversa Parent
- **DPA (Data Processing Agreement)** wajib dengan semua vendor cloud yang menyimpan data anak

### 18.4 Graceful Degradation

Sistem berjalan penuh tanpa fitur recording maupun foto:

```
Consent recording ✓ → Stage Refleksi dengan recording video+audio
Consent recording ✗ → Stage Refleksi dengan penilaian observasi langsung saja
                       Fasilitator input bintang berdasarkan pengamatan — raport tetap lengkap

Consent foto ✓ → Smart Photo masuk raport
Consent foto ✗ → Raport tanpa foto (placeholder ilustrasi)
```

---

## 19. Risiko & Mitigasi

| Risiko | Tingkat | Mitigasi |
|---|---|---|
| Data rekaman/foto anak bocor | **Kritis** | Enkripsi AES-256, audit log, DPA vendor, consent terpisah per jenis data |
| Sesi gagal akibat masalah jaringan | **Tinggi** | Edge mode wajib berfungsi penuh — mini PC identik dengan cloud |
| Kualitas recording outdoor buruk | **Tinggi** | Panduan teknis fasilitator, area semi-tertutup, durasi 60–90 detik |
| Narasi AI tidak akurat atau tidak sesuai anak | **Tinggi** | Review wajib fasilitator/koordinator sebelum raport dikirim |
| Consent orang tua tidak terkumpul tepat waktu | **Sedang** | Kirim H-2, reminder H-1, form digital via WhatsApp satu klik |
| Smartphone fasilitator tidak kompatibel | **Sedang** | Dokumen spesifikasi minimum (Android, Chrome terbaru, ≥8MP) — checklist sebelum program |
| Frame Smart Photo tidak tersync di device | **Sedang** | Frame di-bundle saat install PWA — minimal frame default selalu tersedia offline |
| Sync gagal — data tidak masuk cloud | **Sedang** | Retry otomatis, notifikasi admin jika sync gagal >1 jam, backup manual export JSON |
| Inkonsistensi penilaian antar fasilitator | **Sedang** | Rubrik bintang terdefinisi jelas, kalibrasi fasilitator sebelum sesi |
| Orang tua tidak membuka raport/misi | **Rendah** | Reminder H+3 via WhatsApp, format raport menarik, misi yang mudah dan menyenangkan |

---

## 20. Decision Log

Seluruh keputusan arsitektur dan produk yang terkunci selama proses deliberasi:

| Keputusan | Nilai | Alasan |
|---|---|---|
| **Nama sistem** | Kidversa Edutourism | Rebranding dari StageLearn |
| **Target pengguna** | Anak 5–7 tahun, Edu Wisata outdoor non-formal | Konteks program |
| **Durasi sesi** | Semua stage dalam 1 hari, ~12–15 menit/stage | Attention span anak, program sehari |
| **Jumlah stage** | Fleksibel — dikonfigurasi per program (min 1, default 4) | Satu platform untuk berbagai jenis wisata |
| **Nama & konten stage** | Ditentukan Admin Wisata di Backoffice — data-driven | Fleksibilitas per lokasi wisata |
| **Fasilitator** | 1 spesialis per stage, 5–10 anak/sesi | Rasio ideal untuk asesmen individual |
| **Navigasi stage** | Dikendalikan fasilitator — anak tidak operasikan perangkat | Usia 5–7 tahun belum bisa navigasi mandiri |
| **Learner Interface** | Kiosk mode full-screen di monitor pos | Anak hanya melihat konten |
| **Hardware pos** | Monitor 43" portabel + smartphone fasilitator | Monitor untuk kelompok, smartphone untuk fasilitator |
| **Kiosk** | Opsional — tidak wajib | Smartphone fasilitator menggantikan kebutuhan kiosk |
| **Listrik** | Tersedia, pos mobile | Tidak perlu baterai besar untuk monitor |
| **Jaringan** | WiFi portable router + LAN kabel fallback | Keandalan lokal tanpa bergantung internet |
| **Komunikasi antar stage** | Polling backend/DB — bukan WebSocket | Lebih sederhana, reliable di jaringan lokal |
| **Mode stage** | Sequential (default) + non-sequential via Backoffice | Fleksibel untuk kondisi lapangan |
| **Deployment** | Hybrid Edge-Cloud — auto-detect, sync akhir sesi | Keandalan offline + data terpusat |
| **Backend lokal** | Mini PC i3, 8GB RAM, 256GB SSD, Ubuntu LTS | Cukup untuk stack lengkap, biaya terjangkau |
| **Frontend** | Next.js 14 + Tailwind CSS — satu codebase semua antarmuka | PWA untuk semua, satu repo |
| **Mobile app model** | PWA — bukan APK | Tidak perlu distribusi, update otomatis |
| **Platform mobile** | Android-first · iOS supported tapi bukan prioritas | PWA Android = near-native, zero kompromi |
| **Antarmuka** | 3 PWA: Kidversa Web + Kidversa Mobile + Kidversa Parent | Satu codebase, tiga audience berbeda |
| **Fitur Smart Photo** | Foto + frame lokal (Canvas API) + 1 foto ke raport | Dokumentasi bermakna, offline, tanpa API eksternal |
| **Frame Smart Photo** | Template di-bundle di PWA, dikelola Admin Wisata di Backoffice | Offline-capable, update terpusat |
| **Recording** | Audio + Video via MediaRecorder API di Kidversa Mobile | Asesmen autentik via smartphone fasilitator |
| **Backend** | NestJS + Prisma + MySQL — satu API untuk semua antarmuka | TypeScript end-to-end, schema identik di edge & cloud |
| **Object storage** | MinIO (lokal) → S3-compatible (cloud) | Satu kode upload, dua environment |
| **OS** | Ubuntu LTS 24.04 — identik di mini PC dan cloud via Docker | Zero perbedaan environment |
| **AI narasi** | Claude API (claude-sonnet-4-6) — wajib review sebelum kirim | Kualitas narasi + human-in-the-loop |
| **Misi lanjutan** | Bank misi per program + AI pilih per profil nilai anak | Relevan per topik + dipersonalisasi |
| **Penilaian** | Skala bintang 1–5 + komentar fasilitator per stage | Intuitif, bermakna untuk orang tua |

---

## Lampiran — Changelog dari BRD v2

| Seksi | Perubahan |
|---|---|
| Nama sistem | StageLearn → **Kidversa Edutourism** |
| Jumlah stage | Hardcode 4 → **Fleksibel per program** |
| Antarmuka | 2 (Web + Parent) → **3 PWA (Web + Mobile + Parent)** |
| Mobile app | Tidak ada → **Kidversa Mobile PWA, Android-first** |
| Fitur baru | Tidak ada → **Smart Photo (F-04)** ditambahkan |
| Recording | Kiosk/tablet → **Smartphone fasilitator via Kidversa Mobile** |
| Kiosk | Direkomendasikan → **Opsional** |
| Hardware fasilitator | Tablet khusus → **Smartphone Android fasilitator** |
| Modul sistem | 14 modul → **18 modul** (tambah: Smart Photo, Frame Manager, Fasilitator Module, Program Manager) |
| Estimasi biaya hardware | Rp 37–90 juta → **Rp 33–77 juta** (tanpa kiosk) |
| Tech stack tambahan | — → Canvas API, MediaRecorder API, IndexedDB, Service Worker |

---

*Kidversa Edutourism — BRD v3.0 | Juni 2026 | Dokumen ini bersifat internal dan confidential*
*Menggantikan BRD v2.0 (StageLearn Platform). Untuk riwayat keputusan lengkap lihat: StageLearn_Council_Review_Anak5-7.md*

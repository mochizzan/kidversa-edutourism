# 🎒 Kidversa Edutourism

[![React](https://img.shields.io/badge/Frontend-React%2019-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Build%20Tool-Vite-646CFF?logo=vite)](https://vitejs.dev/)
[![pnpm](https://img.shields.io/badge/Package%20Manager-pnpm-F69220?logo=pnpm)](https://pnpm.io/)
[![Go](https://img.shields.io/badge/Backend-Go%20(Ready)-00ADD8?logo=go)](https://go.dev/)

**Kidversa Edutourism** adalah ekosistem edukasi digital dan sistem asesmen modern untuk sekolah berbasis wisata edukasi. Aplikasi ini dirancang dengan pendekatan *Offline-First* dan *Local-First Persistence* untuk memastikan fungsionalitas penuh di lapangan tanpa ketergantungan konstan pada koneksi internet.

---

## 📌 Status Proyek & Arsitektur Saat Ini

Aplikasi saat ini berjalan **penuh di sisi Frontend** dengan data statis/mock yang sudah mulai ditinggalkan. Fokus pengembangan saat ini adalah optimalisasi **Browser-Side Persistence** dan alur kerja integrasi data lokal sebelum dihubungkan ke backend.

```
┌────────────────────────────────────────────────────────┐
│                      FRONTEND UI                       │
│   (Admin, Fasilitator, Parent, Learner Kiosk Layouts)  │
└───────────────────────────┬────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│               CORE STORES & HOOKS (State)              │
│       (Auth Store, Tenant Store, useLiveSession)       │
└───────────────────────────┬────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│                 CORE SERVICES (Wrapper)                │
└─────────────┬────────────────────────────┬─────────────┘
              ▼                            ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│      LOCAL STORAGE       │  │        INDEXEDDB         │
│  (Session & Auth State)  │  │ (Assessments, Sessions,  │
└──────────────────────────┘  │  Missions, & SMART Photo)│
                              └────────────┬─────────────┘
                                           ▼
                              ┌──────────────────────────┐
                              │    SYNC MANAGER (WIP)    │
                              └────────────┬─────────────┘
                                           ▼
                              ┌──────────────────────────┐
                              │     GO BACKEND CLIENT    │
                              │     (Ready to Connect)   │
                              └──────────────────────────┘
```

---

## 🌟 Fitur Utama (Berdasarkan Role)

Aplikasi ini mengintegrasikan empat ekosistem pengguna yang saling terhubung di dalam satu platform:

### 🏢 1. Panel Admin (Manajemen & Monitoring)
*   **Tenant & User Scoping:** Manajemen multi-sekolah/tenant secara terisolasi.
*   **Program & Session Scheduler:** Pembuatan program edutourism, tahapan (*stages*), dan sesi perjalanan.
*   **Media Review & Reporting:** Pemantauan unggahan foto/rekaman lapangan dan pembuatan narasi laporan otomatis.

### 🧑‍🏫 2. Modul Fasilitator (Aktivitas Lapangan)
*   **Smart Photo & Camera:** Pengambilan foto dokumentasi yang terintegrasi secara pintar di lapangan.
*   **Child Assessment:** Pengisian instrumen asesmen perkembangan anak secara langsung dan cepat.
*   **Offline Recording:** Perekaman aktivitas anak yang disimpan secara aman di penyimpanan lokal web.

### 👪 3. Modul Orang Tua (Parent Portal)
*   **Consent Gate:** Manajemen persetujuan digital untuk partisipasi aktivitas anak.
*   **Daily Stories & Feed:** Pemantauan dokumentasi foto dan cerita perjalanan anak secara *real-time*.
*   **Report Page:** Akses hasil akhir asesmen anak dalam bentuk grafik dan narasi yang mudah dipahami.

### 👶 4. Learner Kiosk (Interaksi Anak)
*   **Kid-Friendly Interface:** Antarmuka interaktif khusus anak untuk melihat misi harian dan petualangan mereka.

---

## 🛠️ Spesifikasi Teknologi

### Frontend (`/frontend`)
*   **Framework & Language:** React 19 dengan TypeScript.
*   **Build Tool & Dev Server:** Vite 8.
*   **Styling:** Tailwind CSS v4 (konfigurasi via `@theme` directive, tanpa config file).
*   **State Management:** Zustand (auth & tenant state).
*   **Penyimpanan Lokal:** IndexedDB (Data transaksional), LocalStorage/SessionStorage (Sesi autentikasi & tenant).
*   **Fitur Progresif:** PWA (Progressive Web App) dengan Service Worker aktif untuk kapabilitas offline.

### Backend (`/backend` - Siap Diintegrasikan)
*   **Language:** Go 1.26 (Golang) dengan framework Echo v5.
*   **ORM & Database:** GORM + SQLite (development).

---

## 🚀 Panduan Memulai (Development Setup)

### Prasyarat
*   [Node.js](https://nodejs.org/) (Versi LTS direkomendasikan)
*   [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

### Langkah Instalasi

1. **Clone Repositori**
   ```bash
   git clone https://github.com/mochizzan/kidversa-edutourism.git
   cd kidversa-edutourism
   ```

2. **Setup Frontend**
   ```bash
   cd frontend
   pnpm install
   ```

3. **Menjalankan Server Pengembangan**
   ```bash
   pnpm dev
   ```

Buka [http://localhost:5173](http://localhost:5173) pada browser Anda.

---

## 📂 Struktur Direktori Utama

```text
kidversa-edutourism/
├── backend/                  # REST API built with Go (Echo v5 + GORM + SQLite)
└── frontend/                 # React SPA Application
    ├── public/               # PWA Assets, Webmanifest, & Service Worker
    └── src/
        ├── app/              # Aplikasi Routing
        ├── core/             # Fondasi Aplikasi (Services, Stores, Hooks, Types)
        │   ├── services/     # API Client & Local Storage Managers
        │   │   ├── local/    # IndexedDB & Local Auth Engine
        │   │   └── storage/  # Skema Database idb.ts
        │   └── stores/       # Global State (Zustand/Context/Custom Stores)
        ├── features/         # Modul Fitur Berdasarkan Pengguna (Admin, Fasilitator, Parent)
        └── shared/           # reusable UI Components, Layouts, & Global Hooks
```

---

## ⚙️ Workflow Pengujian Data Lokal

Untuk memastikan pengujian IndexedDB berjalan murni tanpa tercampur data mock lama:

1. Pastikan proses *seeding* awal di `src/core/services/local/bootstrap.ts` hanya berjalan **sekali** saat database kosong.
2. Lakukan pengecekan melalui **DevTools Browser -> Application -> IndexedDB** untuk memvalidasi persistensi data setelah melakukan operasi CRUD pada aplikasi.
3. Seluruh komponen fitur wajib menggunakan fungsi dari folder `services/` (bukan mengimpor langsung dari `services/mock/`).

---

## 🎨 Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Purple | `#5B2C8D` | Primary |
| Amber | `#F5A623` | Accent |

---

## 📜 License

MIT © 2026 Kidversa Edutourism

🚀 *Developed as a cutting-edge EdTech and Tourism Assessment Platform.*

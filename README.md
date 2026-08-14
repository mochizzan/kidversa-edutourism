# 🎒 Kidversa Edutourism

[![React](https://img.shields.io/badge/Frontend-React%2019-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Build%20Tool-Vite-646CFF?logo=vite)](https://vitejs.dev/)
[![pnpm](https://img.shields.io/badge/Package%20Manager-pnpm-F69220?logo=pnpm)](https://pnpm.io/)
[![Go](https://img.shields.io/badge/Backend-Go%201.26-00ADD8?logo=go)](https://go.dev/)
[![MariaDB](https://img.shields.io/badge/Database-MariaDB%2012-003545?logo=mariadb)](https://mariadb.org/)

**Kidversa Edutourism** adalah ekosistem edukasi digital dan sistem asesmen untuk sekolah
berbasis wisata edukasi. Aplikasi multi-role (Super Admin, Admin Tenant, Fasilitator,
Orang Tua, Learner/Kiosk) dengan arsitektur client-server: frontend React menembak REST API
Go yang mempersist ke MariaDB, plus lapisan PWA + caching lokal (IndexedDB) untuk aset/media.

---

## 📌 Status Proyek & Arsitektur Saat Ini

Backend (Go + Echo + GORM) **sudah terintegrasi penuh** — bukan lagi "siap disambungkan".
Seluruh domain (auth multi-tenant, program/session, asesmen, live monitoring via SSE,
laporan + narasi AI, consent WhatsApp) sudah punya handler, usecase, dan repository.
Frontend mengonsumsi API tersebut melalui `core/services/*` (wrapper `backendClient` +
`apiEnvelope`).

```
┌────────────────────────────────────────────────────────┐
│                      FRONTEND UI                       │
│   (Admin, Fasilitator, Parent, Learner Kiosk Layouts)  │
│   React 19 · TS · Vite · Tailwind v4 · Zustand · PWA   │
└───────────────────────────┬────────────────────────────┘
                            │  REST + SSE (JWT Bearer / HttpOnly cookie)
                            ▼
┌────────────────────────────────────────────────────────┐
│                 GO BACKEND (Echo v5)                   │
│  handler → middleware (JWT/TenantScope) → usecase       │
│  → repository interface → GORM persistence              │
│  + SSE hub · OpenRouter AI · WhatsApp messaging         │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│                 MariaDB 12 (via Docker)                 │
│        migrations/000001_init_schema.up.sql             │
└────────────────────────────────────────────────────────┘

  Local caching (IndexedDB via idb, bukan primary store):
  • media/asset offline • PWA service worker (installable, offline shell)
```

> Catatan: `docs/` memuat BRD, ERD, dan FSD sebagai sumber kebenaran produk.

---

## 🌟 Fitur Utama (Berdasarkan Role)

Aplikasi mengintegrasikan empat ekosistem pengguna yang saling terhubung dalam satu platform:

### 🏢 1. Panel Admin (Manajemen & Monitoring)
*   **Tenant & User Scoping:** Multi-sekolah/tenant terisolasi (SUPER_ADMIN mengelola tenant; non-SA di-scope dari JWT).
*   **Program & Session Scheduler:** Pembuatan program edutourism, tahapan (*stages*), dan sesi perjalanan.
*   **Media Review & Reporting:** Pemantauan unggahan foto/rekaman lapangan dan pembuatan narasi laporan otomatis (OpenRouter AI).

### 🧑‍🏫 2. Modul Fasilitator (Aktivitas Lapangan)
*   **Smart Photo & Camera:** Pengambilan foto dokumentasi lapangan.
*   **Child Assessment:** Pengisian instrumen asesmen perkembangan anak.
*   **Offline Recording:** Perekaman aktivitas anak (berkas di-upload ke backend).

### 👪 3. Modul Orang Tua (Parent Portal)
*   **Consent Gate:** Persetujuan digital (link dikirim via WhatsApp) untuk partisipasi anak.
*   **Daily Stories & Feed:** Pemantauan dokumentasi foto & cerita perjalanan anak (*real-time* via SSE).
*   **Report Page:** Hasil akhir asesmen dalam grafik & narasi.

### 👶 4. Learner Kiosk (Interaksi Anak)
*   **Kid-Friendly Interface:** Antarmuka interaktif khusus anak (akses via single-use kiosk token).

---

## 🛠️ Spesifikasi Teknologi

### Frontend (`/frontend`)
*   **Framework & Language:** React 19 dengan TypeScript 6 (strict).
*   **Build Tool & Dev Server:** Vite 8.
*   **Styling:** Tailwind CSS v4 (konfigurasi via `@theme`, tanpa config file).
*   **State Management:** Zustand (`authStore`, `tenantStore`).
*   **Data Access:** `core/services/*` → REST ke Go backend; caching lokal IndexedDB (`idb`) untuk aset/media.
*   **Fitur Progresif:** PWA (`vite-plugin-pwa`, service worker aktif) — installable + offline shell.

### Backend (`/backend`)
*   **Language:** Go 1.26 dengan framework Echo v5.
*   **ORM & Database:** GORM + **MariaDB 12** (driver `gorm.io/driver/mysql`; migrasi via `golang-migrate`).
*   **Auth:** JWT access (15m) + refresh (HttpOnly cookie, 7d), bcrypt, revocation (jti denylist).
*   **Realtime:** SSE hub (live monitoring).
*   **AI:** OpenRouter narrative generation untuk laporan.
*   **Messaging:** WhatsApp gateway (consent link orang tua).

### Infrastruktur
*   **Orchestration:** Docker Compose (profile `dev` & `prod`) — `mariadb:12`, `backend`, `frontend`.
*   **CI:** GitHub Actions (`backend/.github/workflows/ci.yml`) — gofmt → go vet → go build → go test (backend); pnpm build (frontend).

---

## 🚀 Panduan Memulai (Development Setup)

### Prasyarat
*   [Node.js](https://nodejs.org/) LTS + [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
*   [Go 1.26](https://go.dev/dl/)
*   Docker Desktop (untuk MariaDB + full stack) — atau MariaDB 12 lokal

### Opsi A — Docker Compose (paling mudah)
```bash
# dari root repo
docker compose --profile dev up --build
# frontend  → http://localhost:5173
# backend   → http://localhost:8080  (MariaDB di host port 3307)
```
Hentikan dengan `docker compose --profile dev down`.

### Opsi B — Jalankan terpisah (frontend + backend lokal)
```bash
# 1) Backend
cd backend
cp .env.example .env          # isi JWT_SECRET (>=32 byte) & BOOTSTRAP_SUPERADMIN_PASSWORD
go run ./cmd/migrate          # jalankan migrasi + bootstrap superadmin (butuh MariaDB)
go run ./cmd/server           # API di :8080

# 2) Frontend (terminal lain)
cd frontend
pnpm install
pnpm dev                      # http://localhost:5173 (Vite proxy /api → :8080)
```
> `pnpm build` adalah satu-satunya verification setara-CI untuk frontend — jalankan
> setelah perubahan. Tidak ada script test/lint/format di frontend.

### Perintah Backend (verification)
```bash
cd backend
gofmt -w .          # format (di-enforce di CI)
go vet ./...        # static analysis
go build ./...      # compilation check
go test ./...       # integration test (BUTUH MariaDB 12 jalan)
```
> `go test ./...` saat ini lolos vacuous — **belum ada file `*_test.go`**.

---

## 📂 Struktur Direktori Utama

```text
kidversa-edutourism/
├── backend/                  # REST API Go (Echo v5 + GORM + MariaDB)
│   ├── cmd/
│   │   ├── server/           # entrypoint API server
│   │   └── migrate/          # runner migrasi + bootstrap superadmin
│   ├── internal/
│   │   ├── config/           # load env (godotenv)
│   │   ├── delivery/http/    # handler, middleware, dto
│   │   ├── domain/           # entity + repository interface
│   │   ├── infrastructure/   # persistence(GORM), auth, ai, messaging
│   │   ├── pkg/              # errors, response, sse, util
│   │   └── usecase/          # business logic
│   └── migrations/           # SQL golang-migrate (000001_init_schema)
├── frontend/                 # React SPA
│   ├── public/               # PWA assets, webmanifest, service worker
│   └── src/
│       ├── app/              # router.tsx + routes/ (per-feature)
│       ├── core/             # services (API client), stores, hooks, types, utils
│       ├── features/         # per-role: admin, auth, fasilitator, learner, parent
│       └── shared/           # komponen UI, layouts, templates, hooks
├── compose.yml               # Docker Compose (profile dev/prod)
└── docs/                     # BRD, ERD, FSD, template mini-raport
```

---

## 🔐 Konvensi Multi-Tenancy (Penting)

*   Setiap request melewati middleware `JWTAuth` → `RequireRole` → `TenantScope`.
*   `TenantScope`: SUPER_ADMIN **wajib** mengirim header `X-Tenant-Id` (atau `?tenant_id=` untuk SSE);
    role lain di-scope **hanya** dari JWT dan header `X-Tenant-Id` akan **ditolak**.
*   Jangan hardcode tenant. Di frontend, `X-Tenant-Id` hanya dikirim untuk SUPER_ADMIN
    (lihat `core/services/apiEnvelope.ts` → `withTenantHeader`).
*   Response backend selalu dibungkus envelope `{ data, meta?, error? }`.

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

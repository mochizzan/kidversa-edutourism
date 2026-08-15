# AGENTS.md

## Project Overview

Kidversa Edutourism — platform edukasi + asesmen digital berbasis wisata edukasi
untuk sekolah. Multi-role (Super Admin, Admin Tenant, Fasilitator, Parent,
Learner/Kiosk). UI berbahasa Indonesia.

Monorepo structure:

- frontend/  — React 19 + TypeScript 6 + Vite 8 + Tailwind CSS v4 + PWA
- backend/   — Go 1.26 + Echo v5 + GORM + MariaDB 12
- docs/      — BRD, ERD, FSD, template mini-raport

README.md sudah diperbarui ke kondisi aktual, tapi tetap trust source + file ini
untuk detail arsitektur. Fakta di bawah diverifikasi via MCP codebase_memory
(3357 node, 14361 edge) dan codegraph pada branch v1.8.

## Commands

Frontend (frontend/):
  cd frontend
  pnpm install          # install deps
  pnpm dev              # dev server -> <http://localhost:5173>
  pnpm build            # build:raport-css -> tsc -b -> vite build  <- primary verification
  pnpm preview          # preview production build

- pnpm build = satu-satunya check setara-CI. Jalankan setelah perubahan apa pun.
- build menjalankan build:raport-css dulu (@tailwindcss/cli kompilasi
  shared/templates/miniRaport.tailwind.css -> miniRaport.styles.css).
  Edit source .tailwind.css, BUKAN .styles.css yang digenerate.
- tsconfig.json aktifkan strict, noUnusedLocals, noUnusedParameters — setiap
  import/var tak terpakai = build error.
- Vite proxy /api -> process.env.VITE_API_TARGET || <http://localhost:8080>.
- Tidak ada script test/lint/format. pnpm build adalah verifikasi tunggal.

Backend (backend/):
  cd backend
  go build ./...        # compilation check
  go vet ./...          # static analysis
  gofmt -w .            # format (enforced di CI)
  go run ./cmd/migrate  # migrasi + bootstrap (butuh .env + MariaDB)
  go test ./...         # integration tests (butuh MariaDB 12 jalan)

- CI (backend/.github/workflows/ci.yml) urutan: gofmt -l -> go vet ./... ->
  go build ./... -> go test ./... (job backend, spins mariadb:12 service container).
  Job frontend: pnpm install -> pnpm build.
- gofmt di-enforce. Jalankan gofmt -w . di backend/ sebelum commit.
- go test ./... butuh MariaDB 12 (CI pakai service container). Saat ini TIDAK ADA
  file test (*_test.go = 0) -> CI lolos vacuously.
- Echo v5 (bukan v4). GORM driver MySQL (gorm.io/driver/mysql), BUKAN SQLite.
- Env: copy backend/.env.example -> backend/.env. JWT_SECRET wajib >= 32 byte,
  server refuse start kalau lebih pendek. BOOTSTRAP_SUPERADMIN_PASSWORD wajib diisi (min 8 char).

Full stack (Docker):
  docker compose --profile dev up --build     # dev: live-reload + HMR (ports 5173/8080/3307)
  docker compose --profile prod up --build    # prod: optimized images (port 80/8080)
  docker compose --profile dev down

- MariaDB bind ke host port 3307 (container 3306). Dev DB root/admin.

## Architecture

Layered backend (diverifikasi via MCP):
  cmd/server/main.go   -> wiring dependency (repos, usecases, handlers, hub SSE)
  cmd/migrate/main.go  -> migrasi + bootstrap/seeding superadmin
  internal/
    config/            -> load env (godotenv)
    delivery/http/
      handler/         -> HTTP handlers + registrasi route (router_*.go)
      middleware/       -> JWTAuth, RequireRole, TenantScope, CORS, RateLimit, Recover, Error
      dto/             -> request/response DTO + validasi
    domain/
      entity/          -> tipe domain
      repository/       -> interface repository (kontrak persistence)
    infrastructure/
      ai/              -> OpenRouter narrative generator (laporan)
      auth/            -> JWT, bcrypt hash, revoker (denylist jti), kiosk store
      messaging/        -> WhatsApp gateway (consent link ke orang tua)
      migration/        -> golang-migrate runner
      persistence/      -> GORM models + implementasi repository
    pkg/
      errors/          -> app error types (Internal, NotFound, Conflict, BadRequest)
      response/        -> JSON envelope helpers (OK, OKWithMeta, Created, Fail)
      sse/             -> SSE hub (real-time live monitoring)
      util/            -> util shared (Now, uuid, video probe)
    usecase/           -> business logic
      assessment/      -> asesmen perkembangan anak
      live/            -> live session + stream SSE
      reports/         -> generate laporan + kirim WhatsApp
      session.go       -> session CRUD + lifecycle
  migrations/           -> golang-migrate SQL (terkonsolidasi dari 000001-000012):
                          000001_init_schema.up.sql        (skema awal terkonsolidasi)
                          000002_content_single_source.up.sql (commit 1e08c60:
                            konten jadi entitas mandiri `contents` + junction
                            `stage_contents`; diperkenalkan untuk fix bug
                            cursor:not-allowed di selector Add-Content)
                          DOWN: masing-masing punya .down.sql (reversibel).
                          CATATAN: jangan hapus/rename file migrasi yang sudah
                          tercatat di schema_migrations — akan memicu error
                          "Dirty database version" (lihat recovery di bawah).

Alur request (contoh: POST /api/auth/login):

  1. Echo middleware global: SecurityHeaders -> CORS -> Recover (router.go)
  2. Route group /api/auth -> RegisterAuthRoutes -> AuthHandler.Login
  3. bindAndValidate (validator/v10) -> authUC.Login (usecase)
  4. Usecase: cek kredensial via UserRepository (GORM -> MariaDB), hash bcrypt,
     issue JWT access + refresh (cookie HttpOnly)
  5. response.OK -> JSON envelope { data }

Middleware scoping (penting — verifikasi middleware/auth.go):

- JWTAuth: parse Bearer token (atau SSE cookie kalau header kosong), cek revocation
    jti. Set user_id/tenant_id/role ke context.
- RequireRole(...): blokir kalau role tak diizinkan (403).
- TenantScope: isolasi tenant. SUPER_ADMIN — wajib X-Tenant-Id header (atau
    ?tenant_id= untuk SSE). Non-SA — X-Tenant-Id header DITOLAK (401), scope murni dari JWT.

Frontend structure (frontend/src/):
  app/        -> router.tsx (assembler) + routes/ (per-feature route defs, lazy)
  core/
    config/   -> app config
    constants/-> ROUTES, COLORS, apiRoutes
    hooks/    -> useAuth, useLiveSession, useTenantScope
    services/ -> API client (backendClient, apiEnvelope) + domain service shims
    stores/   -> Zustand: authStore, tenantStore
    theme/    -> theme config
    types/    -> entities.ts, enums.ts, api.ts
    utils/    -> cn(), tenant util, dll
  features/   -> per-role: admin, auth, fasilitator, learner, parent
  shared/     -> components, layouts, templates, ui, hooks, utils, constants
  pages/      -> page-level wrappers

API contract (frontend -> backend) — verifikasi core/services/:

- Backend balas JSON envelope { data, meta?, error? }. List -> meta:{page,limit,total}.
    Error -> { error:{ code, message } } (pesan Indonesia dari MessageForCode).
- backendClient.ts: apiRequest low-level fetch + token refresh proaktif (13 menit,
    sebelum JWT 15m expire) single-flight per tab + cross-tab lock. Parse error envelope.
- apiEnvelope.ts: listRequest/arrayRequest/itemsRequest/itemRequest/voidRequest
    unwrap envelope, flatten meta -> PaginatedResponse, loop pagination saat limit>=100,
    normalize tenant_id null/undefined -> ''. withTenantHeader() tambahkan X-Tenant-Id
    HANYA untuk SUPER_ADMIN (sesuai aturan middleware backend).
- State: Zustand authStore (user/role) + tenantStore (active tenant_id di localStorage).

## Conventions (diverifikasi dari source + git log)

Git / Commit:

- Branch aktif: v1.8. Ada branch versioning v1.1..v1.8 + main.
- Commit style Conventional Commits: feat:, fix(scope):, refactor(fe):,
    test(...), revert(...), feat!: (breaking). Cukup konsisten.
- PR/merge: tidak terdeteksi aturan eksplisit; ikuti convention commit di atas.

Naming:

- Go: PascalCase untuk exported (Type/func/method), snake_case file, interface
    Repository/Usecase. Handler per-domain + router_*.go untuk registrasi route.
- TS: camelCase fungsi/variable, PascalCase komponen/type, file kebab-case.
- Konstanta role/status: string uppercase (SUPER_ADMIN, tenant_required).

Error handling:

- Backend: pkg/errors (apperrors.Internal/NotFound/Conflict/BadRequest) -> di-render
    via response.Fail(c, status, code) (code terdaftar di MessageForCode).
- Frontend: ApiError dengan code/message/status; friendlyError map ke toast.

Multi-tenancy (aturan keras):

- Selalu lewati middleware TenantScope. Jangan hardcode tenant.
- FE: jangan kirim X-Tenant-Id kecuali SUPER_ADMIN. Normalize tenant_id kosong -> ''.

## Where to Look

  Tambah endpoint API        -> backend/internal/delivery/http/handler/ + router_*.go
  Tambah validasi request    -> backend/internal/delivery/http/dto/
  Tambah logika bisnis       -> backend/internal/usecase/
  Tambah tabel/query         -> backend/internal/infrastructure/persistence/ + migrations/ (000001_init_schema.up.sql terkonsolidasi; 000002_content_single_source.up.sql untuk model konten mandiri)
  Ubah auth/tenant scope     -> backend/internal/infrastructure/auth/ + middleware/auth.go
  Tambah halaman FE          -> frontend/src/features/<role>/ + src/app/routes/<role>.tsx
  Panggil API dari FE        -> frontend/src/core/services/ (apiEnvelope + per-domain shim)
  Ubah global state          -> frontend/src/core/stores/ (Zustand)
  Ubah build/PWA             -> frontend/vite.config.ts, frontend/Dockerfile*
  Ubah compose/orchestrasi   -> compose.yml (root)

## Catatan Perubahan vs Versi AGENTS.md Sebelumnya (yang terhapus)

- DIPERBAIKI: jumlah migrasi -> terkonsolidasi dari 000001-000012 menjadi 000001_init_schema.
    DITAMBAH KEMUDIAN: 000002_content_single_source (commit 1e08c60, konten mandiri + junction
    stage_contents). AGENTS.md versi lama salah tulis "hanya 000001".
- DITAMBAH: recovery dirty-database: kalau container backend crash-loop dengan log
    "Dirty database version N. Fix and force version.", jangan hapus DB. Revert tabel ke
    bentuk versi sebelumnya + DROP tabel baru, lalu `UPDATE schema_migrations SET
    version=<N-1>, dirty=false;` (atau `migrate force <N-1>`), lalu restart. Runner migrasi
    sekarang juga auto-heal dirty state (Force + retry) + wait-for-DB sebelum Up().
- DITAMBAH: alur request login end-to-end (verifikasi source).
- DITAMBAH: aturan TenantScope middleware (SUPER_ADMIN wajib X-Tenant-Id, non-SA ditolak).
- DITAMBAH: kontrak API envelope {data,meta,error} + util apiEnvelope/backendClient
    (token refresh proaktif 13m, normalize tenant_id).
- DITAMBAH: status test = 0 file (go test lolos vacuously di CI), urutan CI yang sebenarnya.
- DITAMBAH: perintah Docker Compose (profile dev/prod) + port MariaDB 3307.
- DIKOREKSI: driver DB = MySQL/MariaDB (README salah tulis SQLite).

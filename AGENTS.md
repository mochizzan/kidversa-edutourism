# Repository Guidelines

Authoritative guide for AI coding assistants working in the **Kidversa Edutourism**
monorepo. Verified 2026-09-19 against the actual repository state (CodeGraph +
cocoindex-code index + direct file reads). The old `README.md` is stale in
places — treat this file as the source of truth.

## Project Overview

**Kidversa Edutourism** is a tenant-isolated SaaS platform for Indonesian
schools that combines child developmental assessment with edutourism trip
management.

- **Frontend**: React 19 + TypeScript ~6.0.3 + Vite 8 + Tailwind v4 (CSS-first) + Zustand + PWA
- **Backend**: Go 1.26 (1.26.4) + Echo v5 + GORM + MariaDB 12
- **Messaging**: OpenWA/Baileys WhatsApp engine for consent links
- **AI**: OpenRouter or Gemini (provider switchable) for narrative report generation
- **Orchestration**: Docker Compose + nginx reverse proxy

**Roles.** Only **four** roles exist as backend user roles
(`entity.UserRole`): `SUPER_ADMIN`, `ADMIN`, `KOORDINATOR`, `FASILITATOR`.
The "Parent" and "Learner/Kiosk" access patterns are **frontend-only,
token-scoped public routes** (see `RouteGuard` `public` mode) — they are NOT
backend user roles and never appear in `roles` middleware.

## Architecture & Data Flow

### Backend — Layered Monolith

```
cmd/
  server/main.go          # API entry point + manual DI wiring (14 repos, 6 usecases, ~19 handlers)
  migrate/main.go         # golang-migrate runner + idempotent superadmin/tenant seed

internal/
  config/                 # env → validated Config struct (~40 env vars)
  domain/
    entity/               # BaseModel; enums.go (4 roles + typed enums w/ Valid(): SessionStatus, GroupStatus, ReportStatus, ApprovalStatus, SyncStatus, ContentType, ConsentType, TimelineEventType, …)
    repository/           # 15 interface files + Paginated[T] + Filter structs + result types
  usecase/                # session.go + 5 sub-packages (assessment, attendance, badge, live, reports)
  delivery/http/
    handler/              # ~19 handler structs + router_*.go + sse_helpers.go + phase7_common.go
    middleware/           # auth.go, error.go, ratelimit.go, validator.go, recover.go
    dto/                  # request/response structs (15+ DTOs)
  infrastructure/
    persistence/          # GORM models (embed entity + BeforeCreate UUID hooks) + 17 repos + db.go
    auth/                 # JWT + bcrypt + refresh rotation with reuse-detection + jti denylist + kiosk tokens
    ai/                   # OpenRouter/Gemini factory + narrative_generator + prompts/
    messaging/            # whatsapp.go (OpenWA)
    migration/            # golang-migrate runner (DB allowlist + dirty-recovery skip)
  pkg/
    errors/               # AppError{Status,Code,Err} + constructors + MessageForCode (40+ Indonesian msgs)
    response/             # Envelope{Data,Meta,Error} + 8 helpers
    sse/                  # Backend interface + Hub (ring-buffer replay, keepalive)
    constants/            # 15 tuning constants
    util/                 # token, video_probe, now, util
```

**Request flow.** `router.go` registers global `SecurityHeaders → CORS → Recover → ErrorHandler + validator`; per-route `JWTAuth → RequireRole → TenantScope` are attached **inside each `Register*Routes` function** (not a single global chain). Usecases depend only on `domain` (Interface-Segregation): e.g. `SessionUsecase` depends on narrow `ProgramStageReader`/`ProgramSubstageReader` interfaces, assessment depends on `BadgeEvaluator`, reports depends on `NarrativeGenerator` + `MissionLLMClient`. Optional deps use setter injection.

**SSE dual-auth.** Live/Notification `GET .../stream` routes use **cookie-based** auth
(the `kidversa_session` cookie) so browsers' `EventSource` works; regular API routes use
**Bearer** tokens. Media (photos/frames/avatar) is fully public with consent gating
in-handler. Context keys: `CtxUserID`, `CtxTenantID`, `CtxRole`, `CtxClaims`.

**Response envelope** (every endpoint):
```json
{ "data": ..., "meta": { "page": 1, "limit": 25, "total": 100 }, "error": { "code": "snake_case", "message": "Indonesian text" } }
```

### Frontend — Feature-Role SPA

```
frontend/src/
  features/               # role-based dirs, each with pages/ components/ hooks/
    admin/ (29 pages, 24 components, 6 hooks, utils/csvParser)
    fasilitator/ (7 pages, 10 components, 5 hooks)
    parent/ (4 pages, 1 component)
    learner/ (1 page, 1 component)
    auth/ (3 pages, 11 components, 1 hook)
  core/
    services/             # 18 domain shims + backend-client + api-envelope + types
    stores/               # Zustand: authStore, tenantStore, toastStore
    hooks/                # useAuth, useTenantScope, useLiveSession (+ index.ts)
    types/                # enums, entities, api DTOs, gallery, publicReport, toast
    constants/             # api, apiRoutes, app, timing, errors, etc.
    utils/                # permissions, tenant, jwtClaims, media, validation, etc.
    theme/
  shared/
    components/           # auth (3), feedback (7 + toast/), ui (18), data (5), charts (7), layout (1)
    layouts/              # AdminLayout, ParentLayout, MainLayout, AuthLayout, FasilitatorLayout
    hooks/                # useCrudList + 7 others
    templates/            # miniRaport.tailwind.css → compiled styles
  app/
    router.tsx            # createBrowserRouter (React Router v7), 7 route tables
    routes/               # index, admin, fasilitator, parent, learner, auth, helpers
  App.tsx                 # startup orchestrator
  main.tsx                # React 19 root + PWA registration
  index.css               # Tailwind v4 @theme
  pages/                  # NotFoundPage.tsx
```

**Data flow:** `Component → service shim (core/services/<domain>.ts)` →
`api-envelope.ts` (unwrap/normalize/paginate) → `backend-client.ts` (token,
refresh, `X-Tenant-Id`) → Vite proxy / nginx → backend.

**`App.tsx` startup sequence:** health check → backend-unavailable panel (retry) →
`checkSession` (single-flight) → SUPER_ADMIN active-tenant fetch (3-retry cold-start
backoff for seed races) → auto-select `tenants[0]` → 3-phase splash → global 401 handler →
public kiosk bypass.

**Auth model (frontend):** access token held in-memory (module scope); refresh token in an
`HttpOnly` cookie that is **always** `SameSite=None; Secure=true`; user in
`sessionStorage`. `BroadcastChannel` coordinates cross-tab refresh. Proactive refresh at
~13 min (access TTL is 15 m); 401 → refresh → retry up to 3×. `setTokens(access, _refresh)`
intentionally ignores the refresh param; SSE streams use the `kidversa_session` cookie.

**`RouteGuard`** (unified) has three modes:
- `segment` (admin) — resolves roles + tenant from `ADMIN_ROUTE_ACCESS`, wraps `TenantGuard`.
- `allowedRoles` (fasilitator) — role-only gate, no tenant scoping.
- `public` — token-scoped (parent report/consent, learner kiosk); page validates the token.

## Key Directories

| Path | Purpose |
|---|---|
| `backend/cmd/server/main.go` | API entry point + manual DI |
| `backend/cmd/migrate/main.go` | Migrations + superadmin/tenant seed |
| `backend/internal/config/config.go` | ~40 env vars → `Config` struct |
| `backend/internal/domain/entity/` | `BaseModel`, `enums.go` (4 roles + 13 enums), 10 entity files |
| `backend/internal/domain/repository/` | 15 interface files + `Paginated[T]`, `Filter`, result types |
| `backend/internal/usecase/` | `session.go` + `assessment/`, `attendance/`, `badge/`, `live/`, `reports/` |
| `backend/internal/delivery/http/handler/` | Registry + `router_*.go` + `*_handler.go` |
| `backend/internal/delivery/http/middleware/` | JWTAuth/RequireRole/TenantScope, error, rate-limit, validator, recover |
| `backend/internal/infrastructure/persistence/` | GORM models + 17 repos + `db.go` |
| `backend/internal/infrastructure/auth/` | JWT, bcrypt, refresh rotation, kiosk tokens, revoker |
| `backend/internal/infrastructure/ai/` | OpenRouter/Gemini factory + narrative generator |
| `backend/internal/pkg/` | `errors/`, `response/`, `sse/`, `constants/`, `util/` |
| `backend/migrations/` | `00000N_<name>.up.sql`/`.down.sql` |
| `backend/.github/workflows/ci.yml` | Go + frontend CI |
| `frontend/src/features/` | Role-based directories |
| `frontend/src/core/` | services, stores, hooks, types, constants, utils |
| `frontend/src/shared/` | layouts, components, hooks, templates |
| `frontend/src/app/` | `router.tsx` + route table builders |
| `nginx/default.conf` | Container reverse proxy (listen 8080) |
| `nginx/vps.conf` | VPS host nginx (:80) |
| `tmp/` | Ad-hoc manual smoke scripts (NOT in CI) |

## Development Commands

### Frontend

```bash
cd frontend
pnpm install
pnpm dev                          # Vite dev server :5173, proxies /api → :8080
pnpm build:raport-css             # miniRaport.tailwind.css → miniRaport.styles.css
pnpm build                        # CSS + tsc -b + vite build
pnpm preview
```

### Backend

```bash
cd backend
gofmt -w .                       # REQUIRED; CI fails on unformatted files
go vet ./...
go build ./...
go test ./...                     # requires a running MariaDB (see Testing & QA)
go run ./cmd/migrate              # Migrations + superadmin/tenant seed
go run ./cmd/server               # API :8080
```

Air live-reload (`backend/.air.toml`) is configured; run `air` from `backend/`.

### Full Stack

```bash
docker compose up -d --build      # MariaDB :3307, backend :8080, frontend :8002, wa-engine :2785
docker compose down               # stops containers; does NOT remove bind-mount data
docker compose logs -f backend
```

Dev shortcut for backend-only (frontend runs via `pnpm dev`): `cd backend && docker compose -f docker-compose.yml up -d --build` (uses host MariaDB at `.env`).

## Code Conventions & Common Patterns

### Backend (Go)

- **Files**: `snake_case.go` — e.g. `router_sessions.go`, `session_repo.go`
- **Packages**: lowercase flat names — `handler`, `dto`, `entity`, `repository`, `persistence`, `errors`, `response`
- **Import aliases**: `apperrors` (errors), `appresp` (response), `appmiddleware` (middleware), `apputil` (util).
- **Structs**: PascalCase exported; repository interfaces in `domain/repository`.

**Entity / BaseModel pattern**
```go
type BaseModel struct {
    ID        string    `json:"id"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}
```

**GORM model pattern** — models embed the entity (not a separate `BaseModel`
field, which would inject phantom columns). `BeforeCreate` hooks take an
**unnamed** `*gorm.DB` receiver:
```go
type SessionModel struct {
    entity.Session
    DeletedAt gorm.DeletedAt `gorm:"index"`
}
func (SessionModel) TableName() string { return "sessions" }
func (m *SessionModel) BeforeCreate(tx *gorm.DB) error { /* UUID + timestamps */ }
```
Each model exposes `ToEntity()` / `fromEntity()`.

**Error handling** — stable `snake_case` codes; `MessageForCode()` maps them to
Indonesian UI text. `AsAppError` unwraps for assertions in tests.
```go
apperrors.BadRequest("validation_error", err)
apperrors.NotFound("not_found", err)
apperrors.Conflict("conflict", err)
apperrors.Internal("internal_error", err)
```

**Response helpers** — note the signatures (parameter is `*echo.Context`,
pagination is a single `*Meta`):
```go
appresp.OK(c *echo.Context, data interface{})                              // 200
appresp.OKWithMeta(c *echo.Context, data interface{}, meta *Meta)          // 200
appresp.Created(c *echo.Context, data interface{})                         // 201
appresp.Accepted(c *echo.Context)                                          // 202
appresp.AcceptedWithData(c *echo.Context, data interface{})                // 202
appresp.NoContent(c *echo.Context)                                         // 204
appresp.Fail(c *echo.Context, status int, code string)                     // code→message
appresp.FailMsg(c *echo.Context, status int, code, msg string)             // explicit message
```

**Bind/validate helper** — shared in `phase7_common.go`:
```go
func bindAndValidate(c *echo.Context, req interface{}) error { /* Bind→400 invalid_body; Validate→400 validation_error */ }
```
Programs use a stricter variant (`bindAndValidateStrict`) with `DisallowUnknownFields()`
to reject legacy fields (e.g. `thumbnail_url`) with `400 invalid_body`.

**Auth cookies** — the auth handler **always** sets `Secure=true` and
`SameSite=None`, **ignoring** `COOKIE_SECURE`/`COOKIE_SAMESITE` from `.env`. This is
intentional (cross-origin iframe / 127.0.0.1 edge parity); do not rely on the env
vars for auth cookie attributes. The *access* token is returned in the JSON body
and held in-memory by the frontend. Refresh tokens use 1-use rotation with
reuse-detection and a `jti` denylist (`infrastructure/auth/revoker.go`).

**Tenant scope** — `X-Tenant-Id` is honored only for `SUPER_ADMIN`; all other
roles are scoped to their JWT tenant and the header is ignored on writes
(anti-forgery). SUPER_ADMIN must always send an explicit active tenant for
scoped APIs and SSE.

**Pagination constants** (`pkg/constants`): `DefaultPageLimit = 25`,
`MaxPageLimit = 100`.

### Frontend (TypeScript / React)

- **Components**: `PascalCase.tsx` — `SessionsPage.tsx`, `SessionCard.tsx`, functional only.
- **Hooks/utils/services/stores**: `camelCase.ts` — `useCrudList.ts`, `authStore.ts`.
- **Constants**: `UPPER_SNAKE_CASE` — `PAGE_SIZE`, `FETCH_ALL_LIMIT`, `ROUTES`.
- **Path alias**: `@/*` → `./src/*`.
- **Text**: all UI text in Indonesian.
- **Icons**: Lucide, imported individually.

**Service pattern**
```ts
import { listRequest, itemRequest, voidRequest } from './api-envelope'
export const sessionService: SessionService = {
  list: (params) => listRequest('/api/sessions', params),
  get: (id) => itemRequest(`/api/sessions/${id}`),
  create: (data) => voidRequest('/api/sessions', { method: 'POST', body: data }),
}
```

**Zustand store pattern** (cross-store via `useAuthStore.getState()`):
```ts
const useAuthStore = create<AuthState>((set, get) => ({
  user: null, token: null, isAuthenticated: false,
  login: async (credentials) => { /* ... */ },
  logout: () => { /* ... */ },
}))
```

**Partial-update DTOs** use pointer fields so zero-values can be distinguished
from "not sent" (mirrors the backend `?fields=` patch semantics):
```ts
// PATCH updates only set fields; unset optional fields stay nil
const patch: UpdateProgramDTO = { name: 'New Name' }  // is_active omitted → not changed
```

**Pagination** (`core/constants/api.ts`): `PAGE_SIZE = 10`,
`DEFAULT_CLIENT_PAGE_SIZE = 25`, `FETCH_ALL_LIMIT = 100` (backend hard cap).
`listRequest` auto-loops pagination when `limit >= 100`; `itemsRequest` handles the
nested `{ data: { items: [] } }` shape (reports, consent, participant-missions);
`nullableItemRequest` returns `null` on 404 instead of throwing.

### Tailwind v4 (CSS-first)

No `tailwind.config.js`. Theme tokens live in `frontend/src/index.css`:
```css
@import "tailwindcss";
@theme {
  --color-primary: #5B2C8D;
  --color-accent: #F5A623;
  --animate-fade-in-up: fadeInUp 0.4s ease-out;
}
```
PDF report styles are compiled from
`frontend/src/shared/templates/miniRaport.tailwind.css` into
`miniRaport.styles.css` via `pnpm build:raport-css`.

## Important Files

| File | Purpose |
|---|---|
| `backend/go.mod` | Module `kidversa-edutourism-backend`, go 1.26.4 |
| `backend/.env` / `.env.example` | ~40 env vars (dev uses `.env`; compose injects `.env`) |
| `backend/.air.toml` | Air hot-reload config |
| `backend/cmd/server/main.go` | Bootstrap + manual DI + graceful shutdown |
| `backend/cmd/migrate/main.go` | Migration runner + seed |
| `backend/internal/config/config.go` | Env-driven config validation |
| `backend/internal/delivery/http/router.go` | Echo assembly + middleware chain |
| `backend/internal/delivery/http/handler/registry.go` | Single `Registry` holding all handlers |
| `backend/internal/delivery/http/middleware/auth.go` | JWTAuth, RequireRole, TenantScope |
| `backend/internal/delivery/http/middleware/error.go` | Error normalization to envelope |
| `backend/internal/pkg/errors/errors.go` | `AppError` constructors + `MessageForCode()` |
| `backend/internal/pkg/response/response.go` | Envelope helpers |
| `backend/internal/pkg/sse/hub.go` | SSE pub/sub with ring buffers + replay |
| `backend/internal/domain/entity/base.go` | `BaseModel` |
| `backend/internal/domain/entity/enums.go` | Typed enums |
| `backend/internal/domain/repository/user.go` | Repository interface pattern |
| `backend/internal/infrastructure/persistence/db.go` | GORM/MariaDB connection |
| `frontend/package.json` | React 19, Vite 8, Tailwind v4, Zustand, PWA |
| `frontend/vite.config.ts` | Vite + Tailwind + PWA + `/api` proxy (SSE-aware) |
| `frontend/tsconfig.json` | Strict TS, `@/*` alias |
| `frontend/src/main.tsx` | React 19 root + PWA registration |
| `frontend/src/App.tsx` | Startup orchestrator (health, session, tenant, splash) |
| `frontend/src/app/router.tsx` | `createBrowserRouter` (React Router v7) |
| `frontend/src/core/services/backend-client.ts` | HTTP/SSE client, token refresh, BroadcastChannel |
| `frontend/src/core/services/api-envelope.ts` | Unwrap envelope, tenant_id normalization, pagination |
| `frontend/src/core/stores/authStore.ts` | Zustand auth state |
| `frontend/src/core/stores/tenantStore.ts` | SUPER_ADMIN active tenant |
| `frontend/src/shared/components/auth/RouteGuard.tsx` | Unified auth gate (3 modes) |
| `frontend/src/index.css` | Tailwind v4 theme entry |
| `compose.yml` | Production stack |
| `backend/docker-compose.yml` | Backend-only dev compose |
| `nginx/default.conf` | Container reverse proxy |
| `nginx/vps.conf` | Host (VPS) reverse proxy |

## Runtime / Tooling Preferences

- **Backend runtime**: Go 1.26.4 (CI), `golang:1.26-alpine` (Docker). Static `CGO_ENABLED=0` build; runtime image is `alpine:3.24` (+ ffmpeg, ca-certificates).
- **Frontend runtime**: Node ≥20.19.0 / ≥22.12.0. **CI uses Node 20** (`setup-node@v4`); the **Docker multi-stage build uses `node:22-alpine`**. Both are compatible with Vite 8.
- **Database**: MariaDB 12 (`mariadb:12`). Host port 3307 in production compose; 3306 in dev/CI.
- **Package manager**: **pnpm** via Corepack (no npm/yarn workflows).
- **Formatter/linter**: **`gofmt` only** for Go. There is **no ESLint/Prettier/golangci-lint** — CI enforces `gofmt -l .` (must be empty). Frontend quality is enforced by `pnpm build` (TypeScript `tsc -b` + Vite) and strict `tsconfig.json`.
- **Code intelligence indexes** (gitignored, auto-maintained):
  - `.codegraph/` — CodeGraph native SQLite index (active).
  - `.cocoindex_code/` — cocoindex-code index (active; config at `.cocoindex_code/settings.yml`).
  - `.codebase-memory/` — codebase knowledge-graph artifacts.
- **Ports (dev)**: Vite 5173 · backend 8080 · frontend nginx 8002 · OpenWA 2785 · MariaDB 3307 (compose) / 3306 (dev/CI). All container ports are bound to `127.0.0.1` (not public); the host nginx (`nginx/vps.conf`) is the only public entry point on :80.
- **No Makefile** exists. The root `package.json` is a pnpm-workspace manifest (runtime deps `bcryptjs`, `puppeteer-core`; devDep `mysql2`) with **no scripts** — it is tooling metadata only, not a build target.

## Testing & QA

### Current state — build gates are authoritative (there is no test suite)

- **Backend**: exactly **two** test files under `backend/tests/` (NOT `internal/usecase/`):
  - `backend/tests/assessment/assessment_test.go` — package `assessment_test`, **7** tests for `assessment.Usecase.Upsert` using hand-rolled `fakeAssessmentRepo`/`fakeSessionRepo`/`fakeBadgeEvaluator`.
  - `backend/tests/users_usecase_test.go` — package `auth_test`, **4** tests for `auth.UserUsecase.UpdateUser` self-role-change guards using an in-memory `fakeUserRepo`.
  - Total: **11 test functions**. Framework: Go `testing` only — **no testify, no mocking library**. Tests are pure unit tests over usecase logic with hand-rolled fake structs implementing the `domain/repository` interfaces; they share a `requireAppErrorCode(t, err, want)` helper that unwraps `apperrors.AsAppError` to assert `snake_case` codes. No DB, no HTTP (no `TestMain`, no `httptest`, no migrations run in tests).
  - Invoke: `go test ./...` from `backend/` (needs a running MariaDB; CI provides a `mariadb:12` service).
- **Frontend**: **no tests**. `package.json` has no `test` script; no jest/vitest in deps; `frontend/**/*.{test,spec}.{ts,tsx}` → 0 matches.
- **E2E**: none. `tmp/` holds ~40 ad-hoc manual smoke scripts (`.mjs`/`.test.mjs`/`.sh`/`.tsx`, e.g. `smoke-api.mjs`, `smoke-ui.mjs`, `verify.sh`, `bug1-assessment.test.mjs`, `01-foundation.mjs`…`99-collate.mjs`) with result artifacts (`*.log`, `*.json`, `*.png`). **Never wired to CI.**

### CI pipeline — `backend/.github/workflows/ci.yml`

Two jobs (`push` any branch + `pull_request`):

- **backend** (`working-directory: backend`): `golang:1.26`; `mariadb:12` service (root/admin, db `kidversa_test`, 3306) with `TEST_DB_*` env. Steps: `checkout` → `setup-go@v5` → `gofmt -l .` (**gate: must be empty, else exit 1**) → `go vet ./...` → `go build ./...` → `go test ./...`.
- **frontend** (`working-directory: frontend`): `setup-node@v4` (Node 20) → `corepack enable` + `pnpm@latest activate` → `pnpm install` → `pnpm build`.

### Quality gates (in order)

1. `gofmt -l .` — fails CI if any file is unformatted
2. `go vet ./...`
3. `go build ./...`
4. `go test ./...`
5. `pnpm build` (TypeScript `tsc -b` + Vite + Tailwind compilation)

> The CI MariaDB `kidversa_test` service is currently **unused** by the unit tests (they are pure in-memory) — it exists for future integration tests.

### Migrations

- Location: `backend/migrations/` — naming `00000N_<snake_description>.up.sql` / `.down.sql`.
- Current set: `000001_init_schema`, `000002_simplify_program_hierarchy`, `000003_remove_program_thumbnail`.
- Runner: `backend/internal/infrastructure/migration/migrate.go` (golang-migrate). Creates the database via an allowlist (only `kidversa`/`kidversa_test` literals; deny-by-default to avoid SQL-injection on DDL identifiers), waits with backoff, and applies up-migrations with retry + skip-on-persistent-DDL recovery (Force()s past a failing version, logs loudly).
- Entry point: `backend/cmd/migrate/main.go`. The binary is copied into the Docker image and the `compose.yml` backend `CMD` runs `migrate` (3 attempts) before `server`, failing closed if the schema is broken.

### Gotchas for AI assistants (verified)

- `frontend update()` calls commonly omit `tenant_id`; `api-envelope.normalizeTenantId` converts `null → ""`. Ensure the active tenant is sent explicitly for SUPER_ADMIN-scoped writes.
- GORM embedded `BaseModel`-style structs inject phantom columns if modeled as a named field — always **embed** the entity (`entity.Session` as an anonymous field), not `Session entity.Session`.
- `setUser` in the auth flow must persist user to `sessionStorage` (not just in-memory) so `BroadcastChannel`/tab-restore survives.
- `SUPER_ADMIN` always requires an explicit active tenant for scoped APIs and SSE streams.
- `App.tsx` has a cold-start race: if the SUPER_ADMIN's tenant fetch returns empty (seed not yet complete), it retries 3× — do not remove the retry/backoff.

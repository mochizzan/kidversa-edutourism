# Repository Guidelines

## Project Overview

**Kidversa Edutourism** is a tenant-isolated SaaS platform for Indonesian schools that combines child developmental assessment with edutourism trip management.

It supports five roles: **Super Admin**, **Tenant Admin**, **Fasilitator**, **Parent**, and **Learner/Kiosk**.

Stack:
- **Frontend**: React 19 + TypeScript ~6.0.3 + Vite 8 + Tailwind v4 (CSS-first) + Zustand + PWA
- **Backend**: Go 1.26 + Echo v5 + GORM + MariaDB 12
- **Messaging**: OpenWA/Baileys WhatsApp engine for consent/report links
- **AI**: OpenRouter/Gemini narrative report generation
- **Orchestration**: Docker Compose + nginx reverse proxy

## Architecture & Data Flow

### Backend — Layered Monolith

```
cmd/
  server/main.go           # API entry point + manual DI wiring
  migrate/main.go          # golang-migrate + superadmin/tenant seed

internal/
  config/                  # env → validated Config struct
  domain/
    entity/                # Pure data structs + typed enums (Valid())
    repository/            # Repository interfaces + Paginated[T]/Filter helpers
  usecase/                 # Business logic; depends on domain only
  delivery/http/
    handler/               # Registry + router_*.go + *_handler.go
    middleware/            # JWTAuth, RequireRole, TenantScope, ErrorHandler
    dto/                   # Request/response structs
  infrastructure/
    persistence/           # GORM models + repos with ToEntity()/fromEntity()
    auth/                  # JWT + bcrypt + refresh rotation
    ai/                    # Factory providers + prompt templates
    messaging/             # SSE Hub
  pkg/
    errors/                # AppError{Status,Code,Err}
    response/              # Envelope helpers
    sse/                   # In-memory SSE hub
```

**Request flow**
```
Echo router
  → SecurityHeaders → CORS → Recover
  → JWTAuth → RequireRole → TenantScope
  → Handler binds DTO → Usecase → Repository interface → GORM → MariaDB
```

**Response envelope**
```json
{ "data": ..., "meta": { "page": 1, "limit": 20, "total": 100 }, "error": { "code": "...", "message": "..." } }
```

### Frontend — Feature-Role SPA

```
frontend/src/
  features/                # role-based: admin/, auth/, fasilitator/, parent/, learner/
    <role>/pages.tsx       # lazy-loaded route pages
    <role>/components/     # role-specific UI
    <role>/hooks.ts        # role-specific hooks
  core/
    services/              # domain shims + backend-client + api-envelope
    stores/                # Zustand: authStore, tenantStore, toastStore
    hooks/                 # shared React hooks
    types/                 # TypeScript entities/enums
    constants/             # UPPER_SNAKE_CASE constants
    utils/                 # permissions, tenant/auth helpers
  shared/
    components/            # UI primitives, RouteGuard, TenantGuard
    layouts/               # role layouts
    templates/             # PDF report CSS
  app/
    router.tsx             # createBrowserRouter
    routes/                # per-role route tables
```

**Data flow**
```
Component → service shim (core/services/<domain>.ts)
  → api-envelope.ts unwrap/normalize/paginate
  → backend-client.ts (token, refresh, X-Tenant-Id)
  → Vite proxy / nginx → backend
```

## Key Directories

| Path | Purpose |
|---|---|
| `backend/cmd/` | Entry points: `server/main.go`, `migrate/main.go` |
| `backend/internal/domain/` | Pure entities + repository contracts |
| `backend/internal/usecase/` | Business logic per domain |
| `backend/internal/delivery/http/handler/` | Registry + per-domain routers/handlers |
| `backend/internal/infrastructure/persistence/` | GORM models + repositories |
| `backend/migrations/` | `golang-migrate` SQL files (`000001_init_schema.up.sql`) |
| `frontend/src/core/` | HTTP client, stores, shared hooks, types, constants |
| `frontend/src/features/` | Role-based pages/components/hooks |
| `frontend/src/shared/` | UI components, layouts, templates |
| `frontend/src/app/` | Router + route tables |
| `nginx/` | `default.conf` (container), `vps.conf` (host reverse proxy) |
| `data/` | Bind mounts: `mariadb/`, `wa-engine/` |
| `tmp/` | Ad-hoc manual smoke/E2E `.mjs` scripts (not wired to CI) |

## Development Commands

### Frontend

```bash
cd frontend
pnpm install
pnpm dev                           # Vite dev server :5173, proxies /api → :8080
pnpm build:raport-css              # Compile miniRaport.tailwind.css → .styles.css
pnpm build                         # CSS + tsc -b + vite build
pnpm preview
```

### Backend

```bash
cd backend
gofmt -w .                         # REQUIRED; CI fails on unformatted files
go vet ./...
go build ./...
go test ./...
go run ./cmd/migrate               # Migrations + superadmin/tenant seed
go run ./cmd/server                # API :8080
```

Air live-reload is configured in `backend/.air.toml`.

### Full Stack

```bash
docker compose up -d --build       # MariaDB :3307, backend :8080, frontend :8002, wa-engine :2785
docker compose down
docker compose logs -f backend
```

## Code Conventions & Common Patterns

### Backend (Go)

- **Files**: `snake_case.go` — e.g. `router_sessions.go`, `session_repo.go`
- **Packages**: lowercase flat names — `handler`, `dto`, `entity`, `repository`, `persistence`, `errors`, `response`
- **Import aliases**: `apperrors`, `appresp`, `appmiddleware`
- **Structs**: PascalCase exported; repository interfaces live in `domain/repository`
- **Enums**: typed strings with `Valid()` method in `domain/entity/enums.go`

```go
type UserRole string
const (
    RoleSuperAdmin UserRole = "SUPER_ADMIN"
    RoleAdmin      UserRole = "ADMIN"
)
```

**Entity pattern**
```go
type BaseModel struct {
    ID        string    `json:"id"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}
```

**GORM model pattern**
```go
type SessionModel struct {
    entity.Session
    DeletedAt gorm.DeletedAt `gorm:"index"`
}
func (SessionModel) TableName() string { return "sessions" }
func (m *SessionModel) BeforeCreate(tx *gorm.DB) error { /* UUID + timestamps */ }
```

**Error handling**
```go
apperrors.BadRequest("validation_error", err)
apperrors.NotFound("not_found", err)
apperrors.Conflict("conflict", err)
apperrors.Internal("internal_error", err)
```

Use stable `snake_case` codes; `MessageForCode()` maps them to Indonesian UI text.

**Response helpers**
```go
appresp.OK(c, data)
appresp.OKWithMeta(c, data, page, limit, total)
appresp.Created(c, data)
appresp.NoContent(c)
appresp.Fail(c, status, code, err)
```

### Frontend (TypeScript/React)

- **Components**: `PascalCase.tsx` — `SessionsPage.tsx`, `SessionCard.tsx`
- **Hooks/utils/services/stores**: `camelCase.ts` — `useCrudList.ts`, `authStore.ts`
- **Constants**: `UPPER_SNAKE_CASE` — `API_ROUTES`, `PAGE_SIZE`
- **Components**: functional only — `const X = () => { ... }; export default X`
- **Text**: all UI text in Indonesian
- **Icons**: Lucide, imported individually
- **Path alias**: `@/*` maps to `./src/*`

**Service pattern**
```ts
import { listRequest, itemRequest, voidRequest } from './api-envelope'

export const sessionService: SessionService = {
  list: (params) => listRequest('/api/sessions', params),
  get: (id) => itemRequest(`/api/sessions/${id}`),
  create: (data) => voidRequest('/api/sessions', { method: 'POST', body: data }),
}
```

**Zustand store pattern**
```ts
const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  login: async (credentials) => { ... },
  logout: () => { ... },
}))
// Cross-store access: useAuthStore.getState()
```

**Route guard pattern**
```tsx
<RouteGuard allowedRoles={[Role.Admin, Role.Koordinator]}>
  <AdminPage />
</RouteGuard>
```

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

PDF report styles are built from `frontend/src/shared/templates/miniRaport.tailwind.css` into `miniRaport.styles.css`.

## Important Files

### Backend

| File | Purpose |
|---|---|
| `backend/cmd/server/main.go` | Bootstrap + manual DI + graceful shutdown |
| `backend/cmd/migrate/main.go` | Migration runner + superadmin/tenant seed |
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
| `backend/internal/infrastructure/persistence/session_repo.go` | Example GORM repo |
| `backend/internal/infrastructure/auth/usecase.go` | Login/refresh/logout logic |
| `backend/internal/infrastructure/ai/` | AI factory + prompts |

### Frontend

| File | Purpose |
|---|---|
| `frontend/src/main.tsx` | React root + PWA service worker |
| `frontend/src/App.tsx` | Startup orchestrator (health, session, tenant, splash) |
| `frontend/src/app/router.tsx` | `createBrowserRouter` with lazy loading |
| `frontend/src/app/routes/helpers.tsx` | `guardedRoute`, `SuspenseWrapper` |
| `frontend/src/core/services/backend-client.ts` | HTTP/SSE client, token refresh, BroadcastChannel sync |
| `frontend/src/core/services/api-envelope.ts` | Unwrap envelope, normalize `tenant_id`, pagination |
| `frontend/src/core/services/sessions.ts` | Example domain service shim |
| `frontend/src/core/stores/authStore.ts` | Zustand auth state |
| `frontend/src/core/stores/tenantStore.ts` | SUPER_ADMIN active tenant |
| `frontend/src/core/utils/permissions.ts` | Role helpers + `ADMIN_ROUTE_ACCESS` table |
| `frontend/src/shared/components/auth/RouteGuard.tsx` | Unified auth gate |
| `frontend/src/shared/hooks/useCrudList.ts` | Reusable list hook |
| `frontend/src/core/hooks/useLiveSession.ts` | SSE live dashboard hook |
| `frontend/src/index.css` | Tailwind v4 theme entry |
| `frontend/src/shared/templates/miniRaport.tailwind.css` | PDF report CSS source |
| `frontend/vite.config.ts` | Vite + Tailwind + PWA + `/api` proxy |
| `frontend/tsconfig.json` | Strict TypeScript, `@/*` alias |

### Configuration

| File | Purpose |
|---|---|
| `backend/go.mod` | Go deps: Echo v5, GORM, JWT v5, golang-migrate |
| `backend/.env` / `.env.example` | ~30 env vars: DB, JWT, cookie, AI, WhatsApp, bootstrap |
| `backend/.air.toml` | Air live-reload |
| `backend/.github/workflows/ci.yml` | CI: gofmt, go vet, go build, go test; frontend pnpm build |
| `frontend/package.json` | React 19, Vite 8, Tailwind v4, Zustand, `@tanstack/react-query` (unused) |
| `frontend/pnpm-workspace.yaml` | pnpm workspace with `allowBuilds` |
| `compose.yml` | Production stack |
| `backend/docker-compose.yml` | Backend-only dev compose |
| `nginx/default.conf` / `nginx/vps.conf` | Reverse proxy configs |

## Runtime/Tooling Preferences

- **Frontend runtime**: Node ≥20.19.0 or ≥22.12.0 (Vite 8); package manager **pnpm** via Corepack
- **Backend runtime**: Go 1.26.4; **MariaDB 12** required
- **Database persistence**: `./data/mariadb/`
- **Web**: nginx is the public entry point; containers bind only to `127.0.0.1`
- **WhatsApp engine**: OpenWA/Baileys at `:2785`
- **Formatting**: `gofmt` only; no ESLint/Prettier/golangci-lint
- **DI**: manual constructor injection in `cmd/server/main.go`
- **Path alias**: `@/*` → `./src/*` (frontend)
- **Language**: all UI text in Indonesian

## Testing & QA

### Current State

- **Backend**: one real unit-test file exists: `backend/internal/usecase/assessment/assessment_test.go` (8 cases using hand-rolled fake repositories). Other packages have no tests and `go test ./...` passes vacuously.
- **Frontend**: no test framework, no test files, no `test` script.
- **E2E**: none; `tmp/*.mjs` contains ~60 ad-hoc manual smoke scripts, not wired to CI.

### CI Pipeline (`backend/.github/workflows/ci.yml`)

**Backend job**
1. `gofmt -l .` — fails if any file is unformatted
2. `go vet ./...`
3. `go build ./...`
4. `go test ./...`

**Frontend job**
1. `corepack enable` + `pnpm install`
2. `pnpm build`

### Quality Gates

1. `gofmt` formatting
2. `go vet` + `go build`
3. Frontend `pnpm build` (TypeScript + Tailwind/Vite compilation)
4. Manual verification against `docker compose up -d --build`

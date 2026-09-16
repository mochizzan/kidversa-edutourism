# Repository Guidelines

## Project Overview

Kidversa is a tenant-isolated SaaS edutourism platform for Indonesian schools, supporting five user roles: Super Admin, Tenant Admin, Fasilitator, Parent, and Learner/Kiosk. The platform combines child developmental assessment with school trip management in a single unified system.

The monorepo contains:
- **Backend**: Go 1.26 + Echo v5 + GORM + MariaDB 12, enforcing tenant isolation at middleware level
- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind v4 (CSS-first) + PWA, with role-based UI routing and manual data fetching
- **Services**: WhatsApp engine (OpenWA/Baileys) for messaging integration

## Architecture & Data Flow

### Backend Architecture (Layered Monolith)
```
cmd/
├── server/main.go          # API entry point + manual DI wiring
└── migrate/main.go         # golang-migrate + superadmin bootstrap seeding

internal/
├── config/                  # .env → Config struct + validation (JWT_SECRET ≥32 bytes enforced)
├── domain/                  # Entities (pure data, no GORM) + repository interfaces (contracts)
│   ├── entity/              # BaseModel, domain structs, string enums with Valid()
│   └── repository/          # Interfaces + Paginated[T], Filter structs, Transaction helper
├── usecase/                 # Business logic (depends on domain, never infra)
├── delivery/http/           # Handlers (registry.go + router_*.go), middleware, DTOs
│   ├── handler/             # Single Registry struct, per-domain router_*.go files
│   └── middleware/          # JWTAuth, RequireRole, TenantScope, ErrorHandler
├── infrastructure/          # Persistence (GORM), auth (JWT), ai (OpenRouter/Gemini), messaging (SSE)
│   ├── persistence/         # GORM model wrappers with ToEntity()/fromEntity() mappers
│   ├── auth/                # JWT creation/validation, jti revocation
│   ├── ai/                  # Factory pattern: OpenRouter + Gemini providers, prompt templates
│   └── messaging/           # SSE Hub with per-channel ring buffers (64 events), monotonic cursors
└── pkg/                     # Shared: errors (AppError), response (envelope), sse, util, constants
```

### Frontend Architecture (Feature-Role Based)
```
frontend/src/
├── features/                # Role-based features: admin/, auth/, fasilitator/, parent/, learner/
│   └── <role>/              # Each has: pages/, components/, hooks/
├── core/
│   ├── services/            # backend-client.ts (HTTP/SSE), api-envelope.ts (unwrapping), types.ts
│   ├── stores/              # Zustand: authStore (JWT + user), tenantStore, toastStore
│   ├── hooks/               # Shared hooks (useCrudList, etc.)
│   ├── types/               # TypeScript interfaces
│   ├── constants/           # UPPER_SNAKE_CASE constants
│   └── utils/               # permissions.ts, tenant helpers, auth helpers
├── shared/
│   ├── components/          # UI components, RouteGuard, TenantGuard
│   ├── hooks/               # Shared React hooks
│   ├── layouts/             # Layout components
│   ├── templates/           # miniRaport.tailwind.css → .styles.css (PDF generation)
│   └── utils/               # Shared utilities
├── app/
│   ├── routes/              # Role-specific route tables
│   └── router.tsx           # createBrowserRouter with lazy loading
├── pages/                   # Top-level pages (NotFoundPage, etc.)
├── App.tsx                  # Startup orchestrator: health check → session restore → tenant → RouterProvider
├── index.css                # Tailwind v4 CSS-first: @theme blocks for brand colors, animations, M3 tokens
└── main.tsx                 # ReactDOM.createRoot entry
```

### Data Flow Pattern

**API Request Flow:**
```
Frontend component
  → service shim (core/services/<domain>.ts)
  → apiEnvelope.ts (unwrap {data,meta?,error?}, normalize tenant_id, pagination loop)
  → backend-client.ts (token injection, proactive refresh at 13min, X-Tenant-Id for SA)
  → Vite proxy / nginx
  → Echo router
  → Middleware chain: SecurityHeaders → CORS (explicit allowlist) → Recover → JWTAuth → RequireRole → TenantScope
  → Handler (bind + extract ctx values)
  → Usecase (business rules)
  → Repository interface (GORM implementation)
  → MariaDB
```

**Response Envelope:**
- Every backend response: `{ data, meta?, error? }`
- Lists: `meta: { page, limit, total }`
- Frontend normalizes: `tenant_id: null → ''`, meta → `{ data, total, page, limit, totalPages }`

**SSE Flow:**
```
Hub.Publish (in-memory broadcast) → handler writes SSE frames + keepalive
  → EventSource (cookie-auth, withCredentials) → useLiveSession hook → component re-render
```

**Authentication Flow:**
- Access token: in-memory JS (15min, Bearer header), proactive refresh 13min before expiry
- Refresh token: HttpOnly cookie (7day, rotated on use)
- SSE session: separate HttpOnly cookie (`kidversa_session`, SameSite=None+Secure)
- Cross-tab sync: BroadcastChannel coordinates refresh token rotation
- 401 → `fireUnauthorized()` → `authStore.redirectToLogin()`

**Tenant Isolation (3 layers):**
1. SUPER_ADMIN: sends `X-Tenant-Id` header (or `?tenant_id` for SSE)
2. TenantScope middleware: SA reads header, non-SA scoped from JWT (rejects header if sent)
3. Frontend: auto-injects `X-Tenant-Id` for SUPER_ADMIN, other roles get from JWT

## Key Directories

| Path | Purpose |
|---|---|
| `frontend/` | React 19 SPA, strict TypeScript, Tailwind v4 (CSS-first), PWA |
| `frontend/src/core/` | Services (`backendClient.ts`), stores (Zustand), utils, hooks, types, constants |
| `frontend/src/features/` | Role-based features: admin/, auth/, fasilitator/, parent/, learner/ |
| `frontend/src/shared/` | UI components, layouts, hooks, templates (`miniRaport.tailwind.css`) |
| `backend/` | Go 1.26 + Echo v5 API, manual constructor DI |
| `backend/cmd/` | Entry points: `server/main.go` (API), `migrate/main.go` (DB migration + bootstrap) |
| `backend/internal/` | Layered monolith: config → domain → usecase → delivery/http → infrastructure |
| `backend/internal/delivery/http/handler/` | Registry struct + per-domain `router_*.go` + handler files |
| `backend/internal/infrastructure/persistence/` | GORM models (model wrappers with `ToEntity()`/`fromEntity()` mappers) |
| `backend/internal/pkg/errors/` | `AppError{Status, Code, Err}` with typed constructors |
| `backend/internal/pkg/response/` | Envelope helpers: `OK()`, `OKWithMeta()`, `Created()`, `Fail()` |
| `backend/migrations/` | golang-migrate zero-padded SQL files (000001_init_schema → 000016_*) |
| `nginx/` | Reverse proxy configs: `default.conf` (local), `vps.conf` (production) |
| `data/` | Persistent data: `mariadb/` (DB), `wa-engine/` (WhatsApp sessions) |
| `compose.yml` | Production stack: MariaDB, backend, frontend, wa-engine |

## Development Commands

### Frontend (package manager: pnpm via Corepack)
```bash
pnpm install                    # Install dependencies
pnpm dev                        # Vite dev server on :5173, proxies /api → :8080
pnpm build:raport-css           # Compile miniRaport: miniRaport.tailwind.css → .styles.css
pnpm build                      # Full build: CSS + tsc -b + vite build (CI gate)
pnpm preview                    # Preview production build
```

### Backend (Go 1.26)
```bash
gofmt -w .                      # REQUIRED before commit; CI fails if non-empty
go vet ./...                    # Static analysis
go build ./...                  # Build all packages
go test ./...                   # Vacuously passes (0 *_test.go files)
go run ./cmd/migrate            # Migrations + superadmin bootstrap (needs .env + MariaDB)
go run ./cmd/server             # API on :8080
```

### Full Stack (Docker Compose)
```bash
docker compose up -d --build    # Production stack (MariaDB :3307, backend :8080, frontend :8002, wa-engine :2785)
docker compose down             # Stop (data persists in ./data/)
docker compose logs -f backend  # Tail backend logs
```

All container ports bind to `127.0.0.1` only — host nginx (`nginx/vps.conf`) is the public entry point.

## Code Conventions & Common Patterns

### Backend (Go)
- **File naming**: `snake_case.go` — `router_tenants.go`, `session_repo.go`, `sse_helpers.go`
- **Routers**: prefixed `router_*.go`, one per resource group, each calling `Register*Routes()`
- **Handlers**: single `Registry` struct holds all handlers; per-domain files
- **PascalCase exports**, lowercase flat packages: `handler`, `dto`, `middleware`, `entity`, `repository`, `persistence`, `response`, `errors`
- **Import aliases**: `apperrors`, `appresp`, `appmiddleware` (app+name pattern)

#### Entity Pattern
```go
// domain/entity — pure data, NO GORM tags
type BaseModel struct {
    ID        string     `json:"id"`
    CreatedAt time.Time  `json:"created_at"`
    UpdatedAt time.Time  `json:"updated_at"`
}

// Nullable fields: *string
// Enums: string constants with Valid() method
type UserRole string
const (
    RoleSuperAdmin UserRole = "SUPER_ADMIN"
    RoleAdmin      UserRole = "ADMIN"
    // ...
)
func (r UserRole) Valid() bool { ... }
```

#### GORM Model Pattern
```go
// infrastructure/persistence — wraps entity + adds GORM fields
type SessionModel struct {
    entity.Session                          // embed domain entity
    DeletedAt gorm.DeletedAt `gorm:"index"` // soft delete
}
func (SessionModel) TableName() string { return "sessions" }
func (m *SessionModel) BeforeCreate(tx *gorm.DB) error { /* UUID + timestamps */ }
func (m *SessionModel) ToEntity() *entity.Session { ... }
func FromEntity(e *entity.Session) *SessionModel { ... }
```

#### Error Handling
```go
// AppError{Status, Code, Err} — single error type
apperrors.BadRequest("validation_error", err)   // 400
apperrors.NotFound("not_found", err)             // 404
apperrors.Conflict("conflict", err)              // 409
apperrors.Internal("internal_error", err)        // 500

// Code is stable snake_case string; MessageForCode() maps to Indonesian UI messages
// Repository wraps DB errors as Internal("internal_error", err)
// Usecase uses business-rule codes: "no_groups", "facilitator_required", "grading_incomplete"
```

#### Response Envelope
```go
// pkg/response helpers
appresp.OK(c, data)                    // 200 { data }
appresp.OKWithMeta(c, data, page, limit, total) // 200 { data, meta: {page,limit,total} }
appresp.Created(c, data)               // 201 { data }
appresp.NoContent(c)                   // 204
appresp.Fail(c, status, code, err)     // error { error: {code, message} }
```

### Frontend (TypeScript/React)
- **File naming**: PascalCase.tsx for components (`SessionsPage.tsx`, `SessionCard.tsx`), camelCase.ts for hooks/utils/stores/services
- **Constants**: UPPER_SNAKE_CASE (`API_ROUTES`, `PAGE_SIZE`)
- **Functional components only**: `const X = () => { ... }; export default X;`
- **All UI text in Indonesian**
- **Lucide icons** imported individually (not barrel import)
- **Relative imports** within features

#### Service Pattern
```typescript
// core/services/<domain>.ts
import { listRequest, itemRequest, voidRequest } from './api-envelope'

export const sessionService: SessionService = {
  list: (params) => listRequest('/api/sessions', params),
  get: (id) => itemRequest(`/api/sessions/${id}`),
  create: (data) => voidRequest('/api/sessions', { method: 'POST', body: data }),
}
```

#### Zustand Store Pattern
```typescript
// core/stores/authStore.ts
const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  login: async (credentials) => { ... },
  logout: () => { ... },
}))
// Cross-store access: useAuthStore.getState()
// Persistence: sessionStorage (user), localStorage (tenant)
```

#### Route Guard Pattern
```tsx
// RouteGuard.tsx — three modes:
// 1. Public (token-scoped): redirects authenticated users away
// 2. Role-gated: checks allowedRoles against JWT
// 3. Segment-gated: checks ADMIN_ROUTE_ACCESS table for role + tenantFree flag
<RouteGuard allowedRoles={[Role.Admin, Role.Koordinator]}>
  <AdminPage />
</RouteGuard>
```

### Tailwind v4 (CSS-First)
```css
/* No tailwind.config.js or postcss.config.js */
/* frontend/src/index.css */
@import "tailwindcss";

@theme {
  --color-primary: #5B2C8D;          /* Brand purple */
  --color-accent: #F5A623;           /* Brand gold */
  /* M3 design tokens: surface, on-surface, error, outline, containers */
  --animate-fade-in-up: fadeInUp 0.4s ease-out;
  /* Custom animations for auth transitions, splash screen, toast system */
}
```

## Important Files

### Backend Core
- `backend/cmd/server/main.go` — App bootstrap: config → DB → manual DI (repos → usecases → handlers → Registry → Deps → NewRouter). Graceful shutdown 20s timeout.
- `backend/cmd/migrate/main.go` — Idempotent migration runner + bootstrap: seeds tenant-bandung by slug, superadmin@kidversa.id by email upsert. `SUPERADMIN_FORCE_RESET` controls password overwrite.
- `backend/internal/delivery/http/handler/registry.go` — Single `Registry` struct holding all handlers
- `backend/internal/delivery/http/middleware/auth.go` — JWTAuth (dual Bearer/cookie extraction), RequireRole (map-based), TenantScope (SA header / non-SA JWT)
- `backend/internal/delivery/http/middleware/error.go` — Echo ErrorHandler, normalizes AppError into JSON envelope
- `backend/internal/pkg/errors/errors.go` — `AppError{Status, Code, Err}` + typed constructors + `MessageForCode()` (Indonesian)
- `backend/internal/pkg/response/response.go` — `{data, meta?, error?}` envelope helpers
- `backend/internal/domain/entity/enums.go` — UserRole, SessionStatus, ContentType, etc. (string enums with `Valid()`)
- `backend/internal/infrastructure/messaging/` — SSE Hub: in-memory per-channel ring buffers (64 events), monotonic cursor counters for replay

### Frontend Core
- `frontend/src/App.tsx` — Startup orchestrator: health check → session restore → tenant resolution (SA only) → splash screen → RouterProvider
- `frontend/src/core/services/backend-client.ts` — Centralized HTTP/SSE client: proactive token refresh (13min threshold), cross-tab BroadcastChannel sync, module-scope state
- `frontend/src/core/services/api-envelope.ts` — Response unwrapping, tenant_id normalization (`null → ''`), pagination loop, X-Tenant-Id injection for SA
- `frontend/src/core/stores/authStore.ts` — Zustand auth store: JWT management, sessionStorage persistence, 401 redirect
- `frontend/src/core/utils/permissions.ts` — `ADMIN_ROUTE_ACCESS` table (20+ routes mapping segments to roles + tenantFree)
- `frontend/src/app/router.tsx` — `createBrowserRouter` with lazy loading per feature
- `frontend/src/shared/components/auth/RouteGuard.tsx` — Unified auth gate: public, role-gated, segment-gated modes
- `frontend/src/shared/templates/miniRaport.tailwind.css` — Source CSS for miniRaport PDF generation (`@theme` brand tokens)
- `frontend/src/index.css` — Tailwind v4 entry: brand colors (purple #5B2C8D / gold #F5A623), M3 design tokens, custom animations, print styles

### Configuration
- `backend/go.mod` — module `kidversa-edutourism-backend`, Go 1.26.4, Echo v5, GORM, JWT v5, validator v10, golang-migrate v4
- `backend/.env` / `backend/.env.example` — All config env-driven: JWT_SECRET (≥32 bytes), BOOTSTRAP_SUPERADMIN_PASSWORD, DB_HOST, etc.
- `backend/.github/workflows/ci.yml` — CI: gofmt + go vet + go build + go test (backend), pnpm install + pnpm build (frontend)
- `frontend/package.json` — React 19.2.7, Vite 8.1.3, Tailwind v4.3.2, TypeScript ~6.0.3, `@tanstack/react-query` (present but unused)
- `frontend/tsconfig.json` — ES2020 target, strict mode, `noUnusedLocals`, `noUnusedParameters`, path alias `@/*`
- `frontend/vite.config.ts` — PWA plugin, Tailwind v4 Vite plugin, `/api` proxy → `VITE_API_TARGET || 'http://localhost:8080'`
- `compose.yml` — Production: MariaDB 12 (`:3307`), backend (`:8080`), frontend/nginx (`:8002`), wa-engine (`:2785`). All bound to 127.0.0.1.
- `nginx/default.conf` / `nginx/vps.conf` — Reverse proxy configs for local and VPS deployment

## Runtime/Tooling Preferences

### Required Runtime
- **Frontend**: Node ≥20.19.0 or ≥22.12.0 (Vite 8 engine requirement); package manager **pnpm** (Corepack)
- **Backend**: Go 1.26.4; **MariaDB 12** (not SQLite, not Postgres)
- **Database**: MariaDB 12 with bind-mount persistence (`./data/mariadb/`)
- **Web**: nginx reverse-proxies frontend (8002) + backend (8080); host nginx for public traffic
- **Messaging**: OpenWA/Baileys WhatsApp engine (`:2785`)

### Tooling Constraints
- **No linters/formatters**: `gofmt -w .` is the only CI-gated formatting check
- **No test suite**: 0 `*_test.go` files, no vitest/jest, no testing-library. `go test ./...` passes vacuously.
- **No Tailwind config file**: CSS-first `@theme` blocks in `index.css` and `miniRaport.tailwind.css`
- **No React Query**: `@tanstack/react-query` present but unused; all fetching via manual hooks (`useCrudList`)
- **No DI framework**: full manual constructor injection in `cmd/server/main.go`
- **No ESLint / Prettier / golangci-lint**: zero automated style enforcement beyond gofmt
- **TypeScript strict mode**: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- **All UI text in Indonesian**: error messages, labels, descriptions throughout
- **Path alias**: `@/*` maps to `./src/*` in frontend

### Docker Setup (compose.yml)
```yaml
services:
  mariadb:
    image: mariadb:12
    ports: ["127.0.0.1:3307:3306"]
    volumes: ["./data/mariadb:/var/lib/mysql"]
    healthcheck: healthcheck.sh --connect --innodb_initialized

  backend:
    build: ./backend
    env_file: ./backend/.env
    environment: { DB_HOST: mariadb }
    ports: ["127.0.0.1:8080:8080"]
    volumes: ["./backend/uploads:/app/uploads"]
    depends_on: { mariadb: condition: service_healthy }
    deploy.resources.limits: { cpus: "1.00", memory: 512M }

  frontend:
    build: ./frontend
    ports: ["127.0.0.1:8002:8080"]
    volumes: ["./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro"]
    depends_on: { backend: condition: service_healthy }
    deploy.resources.limits: { cpus: "0.50", memory: 128M }

  wa-engine:
    image: ghcr.io/rmyndharis/openwa:latest
    ports: ["127.0.0.1:2785:2785"]
    volumes: ["./data/wa-engine:/app/data"]
    depends_on: { backend: condition: service_healthy }
```

## Testing & QA

### Test Status
**No test suite exists.** This is an intentional project state:
- **Backend**: 0 `*_test.go` files. CI runs `go test ./...` (passes vacuously). MariaDB service container in CI was provisioned but never used for integration tests.
- **Frontend**: No vitest, jest, or testing-library. No test files, no test scripts in package.json.

### CI Pipeline (`.github/workflows/ci.yml`)
Triggered on push (all branches) and pull_request:

**Backend job:**
1. `gofmt -l .` — fails if any file is not formatted
2. `go vet ./...` — static analysis
3. `go build ./...` — compilation check
4. `go test ./...` — vacuously passes (no tests)

**Frontend job:**
1. `corepack enable` + `pnpm install`
2. `pnpm build` — gates CI (TypeScript + Tailwind + Vite compilation)

No linting, no coverage gates, no PR preview deploys.

### Quality Gates
1. **Backend**: gofmt formatting + go vet + go build must all pass
2. **Frontend**: `pnpm build` must succeed (catches TypeScript errors + Tailwind compilation)
3. **Manual verification**: against running stack (`docker compose up -d --build`)

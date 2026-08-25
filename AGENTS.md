# Repository Guidelines

## Project Overview

Kidversa is a tenant-isolated SaaS edutourism platform for Indonesian schools, supporting five user roles: Super Admin, Tenant Admin, Fasilitator, Parent, and Learner/Kiosk. The platform combines child developmental assessment with school trip management in a single unified system.

The monorepo contains two main components:
- **Backend**: Go 1.26 + Echo v5 + GORM + MariaDB 12, enforcing tenant isolation at middleware level
- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind v4 + PWA, with role-based UI routing and manual data fetching

## Architecture & Data Flow

### Backend Architecture (Layered Monolith)
```
cmd/
├── server/main.go          # API entry point + DI wiring
├── migrate/main.go         # golang-migrate + superadmin bootstrap
└── router.go (generated)

internal/
├── config/                  # .env → Config struct + validation
├── domain/                  # Entities + repository interfaces (contracts)
├── usecase/                 # Business logic (depends on domain, never infra)
├── delivery/http/           # Handlers, routers, middleware, DTOs
├── infrastructure/          # Persistence (GORM), auth (JWT), ai, messaging (SSE)
└── pkg/                     # Shared utilities: errors, response, sse, util
```

### Frontend Architecture (Feature-Role Based)
```
frontend/src/
├── features/
│   ├── admin/
│   ├── auth/
│   ├── fasilitator/
│   ├── learner/
│   └── parent/
├── core/
│   ├── services/            # backendClient.ts (single fetch/SSE wrapper)
│   ├── stores/              # Zustand for auth + tenant state
│   └── utils/                # auth helpers, permissions, tenant
├── app/
│   ├── routes/              # Role-based route tables + RouteGuard
│   └── router.tsx           # createBrowserRouter with lazy loading
└── shared/                   # UI components, templates, design system
```

### Data Flow Pattern
1. **Global Middleware** (router.go):
   - SecurityHeaders → CORS (explicit allowlist, never `*`) → Recover → JWTAuth
   - JWT parses Bearer or SSE cookie, validates jti revocation
   - RequireRole checks permissions after JWTAuth
   - TenantScope: SUPER_ADMIN sends X-Tenant-Id, others get from JWT

2. **Response Envelopes**:
   - Every backend response: `{ data, meta?, error? }`
   - Lists include: `meta:{page, limit, total}`
   - Frontend normalizes tenant_id (null → '')

3. **Authentication Flow**:
   - Access token: in-memory (proactive refresh 2min before expiry)
   - Refresh token: HttpOnly cookie (backend-managed)
   - SSE: separate cookie (`kidversa_session`) + X-Tenant-Id via query param

## Key Directories

|Path|Purpose|
|---|---|
|`frontend/`|React 19 SPA with strict TypeScript, Tailwind v4 (CSS-first), PWA|
|`backend/`|Go Echo v5 API with manual constructor DI (no framework)|
|`backend/cmd/`|Entry points: `server/main.go` (API), `migrate/main.go` (DB migration + superadmin bootstrap)|
|`backend/internal/`|Layered monolith: config → domain → usecase → delivery/http → infrastructure|
|`backend/migrations/`|golang-migrate zero-padded SQL files (000001_init_schema → 000013_*|
|`frontend/src/core/`|Services (`backendClient.ts`), stores (`useAuthStore`), utils (permissions, tenant)|
|`frontend/src/app/routes/`|Role-specific route tables with `RouteGuard` + `getRouteAccess`|
|`frontend/src/shared/`|UI components (`RouteGuard`, `TenantGuard`), templates (`miniRaport.tailwind.css`)|

## Development Commands

### Frontend (package manager: pnpm)
```bash
pnpm install                    # Install dependencies
pnpm dev                       # Vite dev server on :5173, proxies /api → http://localhost:8080
pnpm build:raport-css           # Compile Tailwind miniRaport: miniRaport.tailwind.css → .styles.css
pnpm build                      # Build: CSS + tsc -b + vite build (gate for CI)
pnpm preview                    # Preview production build
```

### Backend (Go 1.26)
```bash
gofmt -w .                      # Required before commit; CI runs gofmt -l . (fails if non-empty)
go vet ./...                    # Go static analysis
go build ./...                  # Build all packages
go test ./...                   # Tests pass vacuously (0 *_test.go files)
go run ./cmd/migrate            # Migrations + superadmin bootstrap (needs .env + MariaDB)
go run ./cmd/server             # API on :8080
```

### Full Stack Development
```bash
docker compose --profile dev up --build     # Live-reload, 5173/8080, MariaDB on host 3307
docker compose --profile prod up --build     # :80
```

## Code Conventions & Common Patterns

### Backend (Go)
- **PascalCase** exports, **snake_case** files
- **Manual constructor DI**: `cmd/server/main.go` builds repos → usecases → handlers → SSE hub
- **Repository pattern**: `domain/` defines interfaces, `infrastructure/persistence` implements
- **Error handling**: return `*pkg/errors.AppError` or `echo.HTTPError`, let `middleware.ErrorHandler` normalize
- **Validation**: go-playground/validator/v10 via `validate` struct tags
- **Logging**: structured with log.Printf, log.Fatalf for fatal startup errors

### Frontend (TypeScript/React)
- **camelCase** functions, **PascalCase** components/types
- **Zustand** stores in `core/stores/` (auth + tenant state)
- **Manual data fetching** (custom hooks like `useCrudList`), NOT React Query (dependency present but unused)
- **Forms/validation**: `react-hook-form` + `zod` + `zodResolver`
- **RouteGuard**: role-based access, tenant scoping for admin routes
- **Tenancy**: SUPER_ADMIN sends `X-Tenant-Id` header or `?tenant_id=`, other roles get from JWT
- **SSE**: cookie-based (`kidversa_session`) + tenant_id query param for SUPER_ADMIN

### Response Envelope Pattern
```typescript
// Backend returns:
{ data: ..., meta?: {page, limit, total}, error?: {code, message} }

// Frontend (api-envelope.ts) normalizes:
- tenant_id: null/undefined → ''
- meta into: {data, total, page, limit, totalPages}
- pagination loop for limits >= 100 (backend cap)
- X-Tenant-Id header injection for SUPER_ADMIN
```

### Tailwind v4 Configuration (CSS-first)
```bash
# frontend/package.json
"build:raport-css": "npx @tailwindcss/cli -i src/shared/templates/miniRaport.tailwind.css -o src/shared/templates/miniRaport.styles.css"

# frontend/src/index.css
@import "tailwindcss";

# No tailwind.config.js, postcss.config.js
```

## Important Files

### Backend Core
- `backend/cmd/server/main.go` - API entry point + DI wiring (25 handlers, 60+ usecases)
- `backend/cmd/migrate/main.go` - golang-migrate + SUPER_ADMIN bootstrap (`superadmin@kidversa.id`, tenant-bandung)
- `backend/internal/delivery/http/router.go` - Complete middleware stack + route registration
- `backend/internal/delivery/http/middleware/auth.go` - JWTAuth (jti revocation), RequireRole, TenantScope
- `backend/internal/delivery/http/middleware/error.go` - Normalizes errors into envelope
- `backend/internal/pkg/response/response.go` - {data, meta?, error} envelope types
- `backend/internal/domain/entity/enums.go` - UserRole: SUPER_ADMIN, ADMIN, KOORDINATOR, FASILITATOR

### Frontend Core
- `frontend/src/core/services/backend-client.ts` - Single fetch/SSE client with proactive token refresh, BroadcastChannel sync
- `frontend/src/core/services/api-envelope.ts` - Envelope unwrapping, tenant_id normalization, pagination loop
- `frontend/src/core/stores/authStore.ts` - Zustand auth with token refresh, stored user in sessionStorage
- `frontend/src/core/utils/permissions.ts` - Role helpers + ADMIN_ROUTE_ACCESS (20+ route definitions)
- `frontend/src/app/router.tsx` - createBrowserRouter with lazy loading
- `frontend/src/shared/components/auth/RouteGuard.tsx` - Unified guard (segment + allowedRoles)
- `frontend/src/shared/templates/miniRaport.tailwind.css` - Source for miniRaport PDF generation

### Configuration
- `backend/go.mod` - module `kidversa-edutourism-backend`, Echo v5, GORM + mysql driver
- `backend/.env.example` - Required: JWT_SECRET (≥32 bytes), BOOTSTRAP_SUPERADMIN_PASSWORD, SUPERADMIN_FORCE_RESET=false
- `backend/.github/workflows/ci.yml` - Tests: gofmt, go vet, go build, go test
- `frontend/package.json` - Strict TypeScript, @tanstack/react-query (unused), build:raport-css
- `frontend/vite.config.ts` - PWA, /api proxy → VITE_API_TARGET || 'http://localhost:8080'

## Runtime/Tooling Preferences

### Required Runtime
- **Frontend**: Node 22 in Docker, Node 20 in CI; package manager **pnpm** (Corepack)
- **Backend**: Go 1.26; **MariaDB 12** (not SQLite, not Postgres)
- **Database**: MariaDB 12 with bind-mount persistence (`./data/mariadb/`)
- **Web**: nginx for production (port 80) reverse-proxies frontend (8002) + backend (8080)

### Tooling Constraints
- **No linters/formatters**: `gofmt -w .` is the only CI-gated check
- **No test suite**: `go test ./...` passes vacuously; frontend has no vitest/jest
- **No Tailwind config file**: CSS-first `@theme` blocks in `miniRaport.tailwind.css`
- **No React Query**: `@tanstack/react-query` present but unused (manual hooks)
- **No DI framework**: manual constructor injection throughout

### Docker Setup
```yaml
# compose.yml
services:
  mariadb:
    image: mariadb:12
    ports: ["127.0.0.1:3307:3306"]
    volumes: ["./data/mariadb:/var/lib/mysql"]
  
  backend:
    build: ./backend
    env_file: ./backend/.env
    environment:
      DB_HOST: mariadb  # in-container, localhost in dev
    ports: ["127.0.0.1:8080:8080"]
    volumes: ["./backend/uploads:/app/uploads"]
    depends_on: [mariadb]
  
  frontend:
    build: ./frontend
    ports: ["127.0.0.1:8002:8080"]  # nginx reverse-proxied in prod
    depends_on: [backend]
```

## Testing & QA

### Test Status
**No test suite exists** – this is explicitly stated in the repo guidelines:
- **Frontend**: No vitest/jest/testing-library, no `test`/`lint`/`format` scripts
- **Backend**: 0 `*_test.go` files, no testify/ginkgo in go.mod

### CI Pipeline
```yaml
# backend/.github/workflows/ci.yml
- gofmt (must be empty) → fail on any formatting differences
- go vet ./...
- go build ./...
- go test ./... → vacuously passes (no tests)

# frontend CI
- pnpm install
- pnpm build → gates CI (verifies TypeScript + Tailwind compilation)
```

### Quality Gates
1. **Build success**: `pnpm build` (CSS + TypeScript + Vite)
2. **Go formatting**: `gofmt -l .` (must be empty)
3. **Manual smoke testing**: against running dev stack (`docker compose --profile dev up`)

### Verification Approach
Since there are no unit/integration tests, verification relies on:
- Manual API testing against running instance
- Frontend UI testing with browser automation tools
- Successful build of both frontend and backend

This repository follows an "experiments-passed" approach to quality: if the build succeeds and manual testing shows expected behavior, the change is considered valid.
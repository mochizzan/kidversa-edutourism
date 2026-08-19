# Repository Guidelines

Multi-role edutourism + child-assessment platform for Indonesian schools: **Super Admin, Tenant Admin, Fasilitator, Parent, Learner/Kiosk**. UI is **Indonesian**. Active branch: `v1.9` (verify with `git branch --show-current`; some older docs say `v1.8`).

Monorepo:
- `frontend/` — React 19 + TypeScript (strict) + Vite 8 + Tailwind v4 (CSS-first, **no `tailwind.config.js`**) + PWA.
- `backend/` — Go 1.26 + Echo **v5** + GORM + MariaDB 12 (via the GORM **MySQL** driver — never SQLite).
- `docs/` — **empty and gitignored**; the BRD/ERD/FSD referenced by README are not in the repo. When docs contradict code, **this file + source code win**.

## Architecture & Data Flow

Backend is a classic layered monolith wired with **manual constructor DI** (no DI framework):
`cmd/server/main.go` builds repos → usecases → handlers → SSE hub and calls `httppkg.NewRouter(...)`.
`cmd/migrate/main.go` runs migrations + bootstraps the superadmin before the server starts.

Layers (`backend/internal/`):
- `config/` — `config.Load()` loads `.env` via godotenv and **fatals on bad env** (see Constraints).
- `domain/` — entities + repository **interfaces** (the contracts everything depends on).
- `usecase/` — business logic; depends on `domain` interfaces, never on `infrastructure`.
- `delivery/http/` — `handler/` (route groups in `router_*.go`), `middleware/`, `dto/` (request validation structs).
- `infrastructure/` — `persistence/` (GORM), `auth/`, `ai/`, `messaging/`.
- `pkg/` — `errors`, `response`, `sse`, `util`.

**Request flow (verified in `delivery/http/middleware/` + `handler/router_*.go`):**
1. Global: `SecurityHeaders` → `CORS` → `Recover` (set in `router.go`).
2. `JWTAuth` parses `Authorization: Bearer` **or** the SSE cookie, checks **jti revocation** (`revoker.IsRevoked`), and sets `CtxUserID`/`CtxTenantID`/`CtxRole`/`CtxClaims` on the echo context.
3. `RequireRole(...)` → 403 if disallowed (must run after `JWTAuth`).
4. `TenantScope`: **SUPER_ADMIN must send `X-Tenant-Id`** (or `?tenant_id=` for SSE, uuid-validated) → 400 `tenant_required` if missing; a **non-SA request carrying `X-Tenant-Id` is rejected with 401** — scope comes only from the JWT. **Never hardcode tenant IDs.**
5. Responses are wrapped: envelope `{ data, meta?, error? }`; lists include `meta:{page,limit,total}`. `middleware/error.go` `ErrorHandler` normalizes `echo.HTTPError` and `*pkg/errors.AppError` into this envelope.

Frontend (`frontend/src/`):
- `features/<role>/` — per-role UI (`admin`, `auth`, `fasilitator`, `learner`, `parent`).
- `app/routes/<role>.tsx` — route tables per role.
- `core/services/` — API calls; `core/stores/` — Zustand global state.
- `core/services/apiEnvelope.ts` adds `X-Tenant-Id` **only for SUPER_ADMIN** and normalizes empty `tenant_id` → `''`.
- Data fetching uses `@tanstack/react-query`; forms/validation use `zod`.

## Key Directories

| Path | Purpose |
|------|---------|
| `backend/cmd/server/main.go` | API entry point + DI wiring (`:8080`). |
| `backend/cmd/migrate/main.go` | Migrations + superadmin bootstrap. |
| `backend/internal/domain/` | Entities + repository interfaces. |
| `backend/internal/delivery/http/` | Handlers, routers, middleware, DTOs. |
| `backend/migrations/` | `000001_init_schema` … `000003_stage_contents_junction` (golang-migrate `.up`/`.down`). |
| `frontend/src/features/` | Role-based feature modules. |
| `frontend/src/shared/templates/` | `miniRaport.tailwind.css` (source) + generated `.styles.css`. |
| `compose.yml` | Dev/prod orchestration (MariaDB 12, ports 5173/8080/80). |

## Development Commands

Frontend (`frontend/`, package manager **pnpm**):
```bash
pnpm install
pnpm dev            # → :5173, proxies /api → $VITE_API_TARGET || http://localhost:8080
pnpm build          # the ONLY CI-equivalent check: build:raport-css && tsc -b && vite build
pnpm preview
```
`build:raport-css` compiles `src/shared/templates/miniRaport.tailwind.css` → `miniRaport.styles.css` with `@tailwindcss/cli`. **Edit the `.tailwind.css` source, never the generated `.styles.css`.** There is no `lint`/`format`/`test` script — `pnpm build` is the gate.

Backend (`backend/`):
```bash
gofmt -w .          # required before commit; CI runs `gofmt -l .` (fails if non-empty)
go vet ./...
go build ./...
go test ./...       # see Testing — passes vacuously today
go run ./cmd/migrate   # migrations + superadmin bootstrap (needs .env + MariaDB)
go run ./cmd/server    # API on :8080
```
Full stack:
```bash
docker compose --profile dev up --build     # live-reload, 5173/8080, MariaDB on host 3307
docker compose --profile prod up --build     # :80
docker compose --profile dev down
```
In Docker the backend uses `DB_HOST=mariadb`; locally `DB_HOST=127.

0.1`.

## Code Conventions & Common Patterns

- **Go**: PascalCase exports, `snake_case` files, `Repository`/`Usecase` interfaces in `domain`; handlers/usecases built via `New*` constructors.
- **TypeScript**: camelCase functions, PascalCase components/types, `kebab-case` files. Role/status constants are **UPPERCASE strings**.
- **Validation**: Go DTOs use `go-playground/validator/v10` via `validate` struct tags (`middleware/validator.go`); FE uses `zod`.
- **Errors**: return `*pkg/errors.AppError` (or `echo.HTTPError`) and let `ErrorHandler` shape the envelope — don't write raw JSON.
- **Commits**: Conventional Commits (`feat:`, `fix(scope):`, `refactor(fe):`, `feat!:`) — used but **not enforced** (no commitlint/husky).
- **State**: Zustand stores in `core/stores/`; server state via React Query. No Redux.

## Important Files

- `README.md` — current high-level truth (verified stack versions, architecture diagram, brand colors).
- `backend/.env.example` → copy to `backend/.env`.
- `backend/go.mod` — module `kidversa-edutourism-backend`, Echo v5, GORM MySQL only.
- `backend/.github/workflows/ci.yml` — the only CI workflow.
- `backend/.air.toml` — Go live-reload in dev containers.
- `frontend/vite.config.ts` — plugins, PWA, `/api` proxy.

## Runtime / Tooling Preferences

- Frontend: **Node 22** in Docker, **Node 20** in CI; package manager **pnpm** (Corepack).
- Backend: **Go 1.26** toolchain; **MariaDB 12** (not SQLite, not Postgres).
- PWA: `vite-plugin-pwa` with `registerType: autoUpdate`.
- No Makefile / Taskfile / shell scripts and no linters (eslint/prettier/golangci-lint) are wired into the repo.

## Hard Constraints (do not violate)

- **Never** use the SQLite driver — GORM + `gorm.io/driver/mysql` against MariaDB only.
- **Echo v5**, not v4 (`github.com/labstack/echo/v5`).
- **Never delete or rename a recorded migration** — it trips a dirty-version error. New migrations append `000004_*` etc.
- **Never hardcode tenant IDs**; scope always derives from the JWT (`TenantScope`).
- `JWT_SECRET` **must be ≥ 32 bytes** or the server refuses to start. `BOOTSTRAP_SUPERADMIN_PASSWORD` is required (min 8 chars). `SUPERADMIN_FORCE_RESET=true` overwrites the superadmin password (default `false` so routine migrations won't clobber a changed one).

### Dirty database recovery
If the backend crash-loops with `Dirty database version N`, **do not drop the DB**. Revert tables to the previous version + drop the new one, then `UPDATE schema_migrations SET version=<N-1>, dirty=false;` (or `migrate force <N-1>`) and restart. The runner also auto-heals dirty state (force + retry) and waits for the DB before `Up()`.

## Testing & QA

**There is no test suite.** Treat "tests passed" as meaningless here:
- Frontend: **no** vitest/jest/testing-library and **no** `test`/`lint`/`format` script in `package.json`.
- Backend: **0 `*_test.go` files**, no testify/ginkgo in `go.mod`. `go test ./...` succeeds vacuously (CI even spins a `mariadb:12` service for the `kidversa_test` DB that no test uses). `config.TestDSN()` is a config helper, not a test.

Verification therefore relies on `go build ./...` / `pnpm build` and manual smoke testing against a running stack (`docker compose --profile dev up`). When changing behavior, reproduce locally and exercise the actual API/UI surface.

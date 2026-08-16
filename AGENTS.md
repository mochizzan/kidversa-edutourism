# AGENTS.md

Kidversa Edutourism — multi-role edutourism + child-assessment platform (Super Admin,
Tenant Admin, Fasilitator, Parent, Learner/Kiosk). UI is Indonesian. Active branch: `v1.8`.

Monorepo:
- `frontend/` — React 19 + TS (strict) + Vite 8 + Tailwind v4 + PWA
- `backend/`  — Go 1.26 + Echo v5 + GORM + MariaDB 12
- `docs/`     — BRD, ERD, FSD (product truth). README.md is current; this file + source win on conflict.

## Commands

Frontend (`frontend/`):
- `pnpm install` / `pnpm dev` (→ :5173) / `pnpm build` / `pnpm preview`
- `pnpm build` is the **only CI-equivalent check** — run it after any change. There is no test/lint/format script.
- `build` runs `build:raport-css` first (`@tailwindcss/cli` compiles `shared/templates/miniRaport.tailwind.css` → `miniRaport.styles.css`). Edit the `.tailwind.css` source, never the generated `.styles.css`.
- `tsconfig` enables `strict`, `noUnusedLocals`, `noUnusedParameters` — unused imports/vars are build errors.
- Vite proxies `/api` → `process.env.VITE_API_TARGET || http://localhost:8080`.

Backend (`backend/`):
- `gofmt -w .` (enforced in CI, run before commit) → `go vet ./...` → `go build ./...` → `go test ./...`
- `go run ./cmd/migrate` — runs migrations + bootstraps superadmin (needs `.env` + MariaDB).
- `go run ./cmd/server` — API on :8080.
- `go test ./...` needs MariaDB 12. There are **0 `*_test.go` files**, so CI passes vacuously — don't trust "tests passed" as proof.
- CI order: `gofmt -l` (fails if non-empty) → `go vet` → `go build` → `go test` (job spins a `mariadb:12` service).

Full stack:
- `docker compose --profile dev up --build` (live-reload, ports 5173/8080, MariaDB on host **3307**) / `--profile prod up --build` (port 80) / `--profile dev down`.
- In Docker, backend uses `DB_HOST=mariadb`; locally `DB_HOST=127.0.0.1`.

## Backend architecture (verified)

- `cmd/server/main.go` wires repos → usecases → handlers → SSE hub. `cmd/migrate/main.go` = migration + superadmin bootstrap.
- Layers: `config` (godotenv) · `delivery/http` (handler + `router_*.go` + middleware + dto) · `domain` (entity + repository interfaces) · `usecase` · `infrastructure` (persistence/GORM, auth, ai, messaging) · `pkg` (errors, response, sse, util).
- **Echo v5, not v4.** GORM uses the **MySQL driver** (`gorm.io/driver/mysql`) against MariaDB — never SQLite.
- Migrations: `migrations/*.up.sql` + `.down.sql`, golang-migrate. Current set: `000001_init_schema`, `000002_content_single_source`, `000003_stage_contents_junction`. **Never delete or rename a recorded migration** — it triggers a dirty-version error.

### Request flow & multi-tenant scoping (hard rules)
1. Global middleware: SecurityHeaders → CORS → Recover.
2. `JWTAuth` parses Bearer (or SSE cookie) and checks jti revocation, sets user/tenant/role on context.
3. `RequireRole(...)` → 403 if disallowed.
4. `TenantScope`: **SUPER_ADMIN must send `X-Tenant-Id`** (or `?tenant_id=` for SSE); non-SA requests with `X-Tenant-Id` are **rejected (401)** — scope is taken only from the JWT. Do not hardcode tenant IDs.
- Responses are wrapped in envelope `{ data, meta?, error? }`; lists include `meta:{page,limit,total}`. Frontend `apiEnvelope.ts` adds `X-Tenant-Id` only for SUPER_ADMIN and normalizes empty `tenant_id` → `''`.

### Dirty database recovery
If the backend crash-loops with `Dirty database version N`, do **not** drop the DB. Revert tables to the previous version + drop the new one, then `UPDATE schema_migrations SET version=<N-1>, dirty=false;` (or `migrate force <N-1>`) and restart. The runner also auto-heals dirty state (force + retry) and waits for the DB before `Up()`.

## Env setup (backend/.env)
Copy `backend/.env.example` → `backend/.env`. `JWT_SECRET` must be **≥ 32 bytes** or the server refuses to start. `BOOTSTRAP_SUPERADMIN_PASSWORD` is required (min 8 chars). `SUPERADMIN_FORCE_RESET=true` resets the superadmin password from env (default false — routine migrations won't overwrite a changed password).

## Where to look
- New API endpoint → `backend/internal/delivery/http/handler/` + `router_*.go`; validation → `dto/`
- Business logic → `backend/internal/usecase/`; tables/queries → `infrastructure/persistence/` + `migrations/`
- Auth/tenant scope → `infrastructure/auth/` + `delivery/http/middleware/`
- New FE page → `frontend/src/features/<role>/` + `src/app/routes/<role>.tsx`; API calls → `src/core/services/`; global state → `src/core/stores/` (Zustand)
- Build/PWA → `frontend/vite.config.ts`; orchestration → root `compose.yml`

## Conventions
- Conventional Commits: `feat:`, `fix(scope):`, `refactor(fe):`, `feat!:` (breaking).
- Go: PascalCase exports, `snake_case` files, `Repository`/`Usecase` interfaces. TS: camelCase fns, PascalCase components/types, kebab-case files. Role/status constants are UPPERCASE strings.

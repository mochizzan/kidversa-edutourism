# Repository Guidelines

Authoritative guide for AI assistants working in the **Kidversa Edutourism** monorepo. Verified against code 2026-09-27. Where `README.md` disagrees with this file or the code, trust the code — README is stale in several places (test scripts, compose profiles, migrations).

## Project Overview

Multi-tenant SaaS for Indonesian schools combining child developmental assessment with edutourism trip management. Admins/facilitators manage programs, sessions, groups, participants, assessments, and report (rapor) delivery; parents view token-scoped reports; learners use public kiosk routes.

- **Backend**: Go 1.26 + Echo v5 + GORM + MariaDB 12 (`backend/`)
- **Frontend**: React 19 + TypeScript ~6.0.3 + Vite 8 + Tailwind v4 (CSS-first) + Zustand + PWA (`frontend/`)
- **Messaging/AI**: OpenWA/Baileys WhatsApp gateway for consent/report delivery; OpenRouter or Gemini (switchable) for narrative report generation.
- **Roles**: only 4 backend roles — `SUPER_ADMIN`, `ADMIN`, `KOORDINATOR`, `FASILITATOR`. "Parent"/"Learner" are frontend-only, token-scoped public routes (`RouteGuard` `public` mode), never backend roles.

## Architecture & Data Flow

### Backend layering

```
delivery/http (router, middleware, handler, dto)
  → usecase (business logic, AppError)
  → domain/repository (interfaces)   ← implemented by infrastructure/persistence (GORM)
  → domain/entity (framework-free models)
```

- **Entry + DI**: `backend/cmd/server/main.go` — manual constructor wiring (config → DB → JWT/revoker → SSE hub → repos → usecases → `handler.NewRegistry` → `httppkg.NewRouter(deps)`). No DI framework; optional cross-usecase deps via setters.
- **Routing**: single table `delivery/http/router.go` mounts `/api` + `/health` with global `SecurityHeaders → CORS → Recover → ErrorHandler`; each resource has its own `handler/router_*.go` attaching `authMW (JWTAuth) → roleMW (RequireRole) → TenantScope()` per route.
- **Tenant flow**: `JWTAuth` sets user/tenant/role claims → `TenantScope` resolves tenant (SA: `X-Tenant-Id` header, or `?tenant_id=` for SSE, else 400 `tenant_required`; non-SA: JWT tenant only, header present → **401**) → handler reads `appmiddleware.GetTenantID(c)` → repo scopes via `scopeByTenant` (`infrastructure/persistence/helpers.go`).
- **Errors → envelope**: handlers just `return err`; `middleware/error.go` `ErrorHandler` maps `AppError` to `{data, meta, error}` via `pkg/response` helpers; `MessageForCode` maps stable snake_case codes to Indonesian messages.
- **SSE**: `GET .../stream` uses **cookie auth** (`kidversa_session`) because EventSource cannot send headers; flow `handler → sse_helpers.go streamSSE → pkg/sse/hub` (ring-buffer replay + keepalive). Publish sites: `usecase/live`, notification usecases.

### Frontend flow

`main.tsx` (i18n ready before render, PWA) → `App.tsx` (health check → `checkSession()` → SA `fetchTenants()` + auto-select → `RouterProvider`) → `app/router.tsx` (role route arrays).

```
Component → core/services/<domain>.ts shim → api-envelope.ts (unwrap/normalize/paginate)
         → backend-client.ts (Authorization, refresh, X-Tenant-Id for SA) → Vite proxy/nginx → backend
```

- **Guards**: `shared/components/auth/RouteGuard.tsx` — `segment` (admin: roles + tenant via `ADMIN_ROUTE_ACCESS`/`getRouteAccess`), `allowedRoles` (fasilitator), `public` (token-scoped parent/learner; page validates the token).
- **State**: Zustand (`authStore`, `tenantStore`, `toastStore`); cross-store access via `useXxxStore.getState()`. User is persisted to sessionStorage (must survive reloads); access token lives in memory only; refresh token is an HttpOnly cookie.
- **Auth**: proactive refresh at ~13 min; 401 → refresh → retry (max 3); `BroadcastChannel` coordinates cross-tab refresh.

## Key Directories

| Path | Purpose |
|---|---|
| `backend/cmd/server`, `backend/cmd/migrate` | API entry + manual DI; migration runner + superadmin/tenant seed |
| `backend/internal/delivery/http/` | `router.go`; `handler/` (`*_handler.go`, `router_*.go`, `registry.go`, `phase7_common.go` bind/validate/pagination helpers); `middleware/`; `dto/` |
| `backend/internal/usecase/` | Business logic: flat `session.go` + `assessment/ attendance/ badge/ live/ reports/` |
| `backend/internal/domain/` | `entity/` (models, enums) + `repository/` (interfaces, filters, `Paginated[T]`) |
| `backend/internal/infrastructure/` | `persistence/` (GORM `*_repo.go`/`*_model.go`), `auth/` (JWT, revoker, auth/user/tenant usecases), `ai/`, `messaging/`, `migration/` |
| `backend/internal/pkg/` | `errors/ response/ sse/ constants/ util/ phoneutil/` |
|`backend/migrations/`|`000001_init_schema` (`.up.sql`/`.down.sql`) — skema final tunggal hasil konsolidasi 000001–000010; riwayat migrasi lama dipindahkan ke `backups/`|
| `frontend/src/app/` | `router.tsx` + `routes/` tables + guard helpers (`guardedRoute`, `lazyRoute`) |
| `frontend/src/core/` | `services/` (shims + `backend-client` + `api-envelope`), `stores/`, `hooks/`, `types/`, `constants/`, `utils/`, `i18n/` |
| `frontend/src/features/` | Role dirs: `admin/ fasilitator/ parent/ learner/ auth/` (pages/components/hooks) |
| `frontend/src/shared/` | Cross-feature `components/ layouts/ hooks/ templates/` (incl. mini-raport CSS source) |
| `frontend/src/locales/` | i18n JSON for 9 languages (id, en, ja, ko, ms, th, tl, vi, zh) |
| `frontend/tests/unit/` | Vitest suites + `test-utils.tsx` |
| `tmp/` | Gitignored ad-hoc manual scripts (API probes, Puppeteer flows) + result artifacts; never commit |
| `nginx/`, `compose.yml`, `scripts/push-ghcr.sh` | Reverse-proxy configs; production stack (GHCR pull); manual image publish |

## Development Commands

```bash
# Backend (run from backend/)
gofmt -w .               # REQUIRED before commit; gate: `gofmt -l .` must be empty
go vet ./...
go build ./...
go test ./...             # runs without a DB today (fakes + sqlmock)
go run ./cmd/migrate      # migrations + seed (needs BOOTSTRAP_SUPERADMIN_PASSWORD)
go run ./cmd/server       # API :8080, health GET /health
air                      # live reload (backend/.air.toml)

# Frontend (run from frontend/)
pnpm install
pnpm dev                  # Vite :5173, proxies /api → :8080 (SSE-aware for /stream)
pnpm build                # miniRaport CSS + tsc -b + vite build
pnpm preview
pnpm test:unit:run        # vitest once
pnpm test:unit:typecheck  # tsc over tests/ (pnpm build's tsc -b does NOT cover tests/)

# Stack
docker compose pull && docker compose up -d    # root compose.yml is PRODUCTION-only: GHCR images, no build/profiles
cd backend && docker compose up -d --build     # dev backend only (host MariaDB)
scripts/push-ghcr.sh                           # manual image publish (no image CI exists)
```

**Ports**: 5173 Vite · 8080 backend · 8002 frontend nginx · 3307 MariaDB (compose) / 3306 local · 2785 OpenWA · 80 host nginx (`nginx/vps.conf`). Compose binds everything to `127.0.0.1`; `nginx/vps.conf` is the only intended public entry.

## Code Conventions & Common Patterns

### Backend (Go)

- **File naming**: handlers `*_handler.go`, route mounters `router_*.go`, GORM repos `*_repo.go`, models `*_model.go`, DTOs `dto/<domain>.go`; packages match dirs. Import aliases: `apperrors`, `appresp`, `appmiddleware`, `httppkg`, and usecase aliases like `assessmentuc`.
- **Echo v5**: handlers are `func (h *XHandler) List(c *echo.Context) error` and the context is **dereferenced everywhere**: `(*c).QueryParam(...)`, `(*c).Request().Context()` — `c.Param(...)` won't compile.
- **Errors**: `apperrors.BadRequest("validation_error", err)` / `NotFound` / `Conflict` / `Internal` — stable snake_case codes; assert codes in tests via `apperrors.AsAppError`.
- **Response helpers** (take `*echo.Context`): `appresp.OK`, `OKWithMeta`, `Created`, `Accepted`, `NoContent`, `Fail`, `FailMsg`.
- **Handler helpers** in `handler/phase7_common.go`: `bindAndValidate(c, &req)` (→ 400 `invalid_body`/`validation_error`), `bindUUID`, `pagination(c)`. Some routes use `bindAndValidateStrict` (rejects unknown fields).
- **Partial updates use pointer DTO fields**: `UpdateUserRequest{ IsActive *bool \`json:"is_active,omitempty"\` }`. The usecase patch is *empty-means-skip* (a plain `string,omitempty` can never clear a value). GORM `.Updates(model)` likewise skips zero-valued fields.
- **GORM models embed the entity**: `type SessionModel struct { entity.Session; DeletedAt gorm.DeletedAt }` — a named field injects phantom columns. `TableName()` + `BeforeCreate` (UUID/timestamps) is load-bearing: skipping it inserts `""` as PK.
- **Route mounting pattern**: `RegisterXxxRoutes(g, h, jm, revoker, ...)` builds `authMW`/`roleMW`, then `g.GET("", h.List, authMW, roleMW, appmiddleware.TenantScope())`.

### Frontend (TypeScript / React)

- **Naming**: `PascalCase.tsx` components/pages, `camelCase.ts` hooks/utils/services/stores, `UPPER_SNAKE_CASE` constants; alias `@/*` → `./src/*`; all UI text in Indonesian; Lucide icons.
- **Service shims**: interface in `core/services/types.ts`, exported singleton using `listRequest`/`itemRequest`/`voidRequest`… — never raw `fetch`:
  ```ts
  export const sessionService: SessionService = {
    list: (params) => listRequest(API_ROUTES.SESSIONS.BASE, params),
  }
  ```
- **Envelope shapes differ**: most lists are `{data:[...]}` → `listRequest`; reports/consent/participant-missions/mission-banks wrap as `{data:{items:[]}}` → `itemsRequest`; `nullableItemRequest` returns `null` on 404. `limit >= 100` silently loops all pages (`fetchAllPages`); backend hard cap is 100.
- **Tenant**: `X-Tenant-Id` is attached only for SUPER_ADMIN (`backend-client.ts` / `getActiveTenantId`); `tenant_id` null → `""` via `normalizeTenantId`. Never add the header globally — backend 401s non-SA requests that carry it.
- **Constants**: URLs from `API_ROUTES` (`core/constants/apiRoutes.ts`, `encodeURIComponent` builders), paths from `ROUTES` (`core/constants/app.ts`).
- **Zustand**: cross-store reads via `getState()`; `setUser` must persist to sessionStorage or reload loses the session. List pages use `shared/hooks/useClientList` — it keeps `fetchFn` in a ref instead of an effect dep (call sites recreate the closure every render; adding it to deps causes an infinite loop) and re-fetches only when `deps` or `refresh()` change.
- **Tailwind v4 is CSS-first**: tokens in `frontend/src/index.css` `@theme`. `miniRaport.styles.css` is **generated** — edit `miniRaport.tailwind.css` and run `pnpm build:raport-css`, never the compiled file.

## Important Files

| File | Why it matters |
|---|---|
| `backend/cmd/server/main.go` | Entry point + all manual wiring |
| `backend/cmd/migrate/main.go` | Migrations + idempotent seed; dirty state needs a manual `schema_migrations` fix |
| `backend/internal/delivery/http/router.go` | The only route table + middleware chain |
| `backend/internal/delivery/http/handler/registry.go` | Registry holding every handler |
| `backend/internal/delivery/http/middleware/auth.go` | `JWTAuth`, `RequireRole`, `TenantScope` |
| `backend/internal/delivery/http/middleware/error.go` | `AppError` → response envelope |
| `backend/internal/pkg/response/response.go`, `pkg/errors/errors.go` | Envelope helpers + `AppError`/`MessageForCode` |
| `backend/internal/pkg/sse/hub.go` | SSE pub/sub with replay |
| `backend/internal/config/config.go` | Env loading + startup validation (~40 env vars) |
| `frontend/src/App.tsx` | Startup orchestrator (health, session, tenant, splash) |
| `frontend/src/app/router.tsx` | `createBrowserRouter` route composition |
| `frontend/src/core/services/backend-client.ts` | HTTP/SSE client, token refresh, tenant header |
| `frontend/src/core/services/api-envelope.ts` | Envelope unwrap, pagination, tenant normalization |
| `frontend/src/shared/components/auth/RouteGuard.tsx` | Unified auth gate (3 modes) |
| `frontend/vite.config.ts` | Alias, dev proxy (SSE-aware), PWA |
| `compose.yml`, `nginx/default.conf`, `nginx/vps.conf` | Production stack + reverse proxies |

## Runtime/Tooling Preferences

- **Go 1.26.4**, formatted with **gofmt only** — there is no golangci-lint/revive config.
- **Node**: Docker build uses `node:22-alpine`; no `.nvmrc`/`engines` pin. **pnpm** via corepack for `frontend/` only. The root `package.json` is a scriptless dep manifest with its own lockfiles — a second, independent pnpm install zone; run builds/tests from `frontend/`.
- **No ESLint/Prettier/Biome** — frontend gates are `tsc` (two tsconfigs) + vitest. Don't invent lint commands.
- **Server startup constraints**: refuses to start if `JWT_SECRET` < 32 bytes; `BOOTSTRAP_SUPERADMIN_PASSWORD` (≥8 chars) required for bootstrap. Auth cookies are hard-set `Secure; SameSite=None` (env vars ignored, intentional). Backend container runs `migrate` first and **fails closed** if migrations fail.
- **No CI/CD pipeline is configured**: GitHub Actions was intentionally removed by decision — no `.github/workflows/` exists anywhere in this repo, so all gates must be run locally:
  `gofmt -l .` (empty) → `go vet ./...` → `go build ./...` → `go test ./...` → `pnpm build` → `pnpm test:unit:run` → `pnpm test:unit:typecheck`.
- **SSE must stay special-cased in three places**: Vite proxy (keep-alive for `/stream`), `nginx/default.conf` (`proxy_buffering off`, 86400s timeout), `nginx/vps.conf`. A plain `proxy_pass` rewrite breaks live monitoring.
- **Local harness rules** in `.omp/rules/` (gitignored) ban shell grep/sed/awk and heredoc file creation — use the repo search/edit tools instead.
- **Never commit**: `tmp/` artifacts (logs/screenshots/credentials), `.env`, `backups/*.sql`, generated `miniRaport.styles.css` edits that weren't rebuilt.

## Testing & QA

### Backend — 14 `*_test.go` files, stdlib `testing` only

- 13 external-package files under `backend/tests/` (`session_create_gate_test.go`, `users_usecase_test.go`, `reports/`, `reportphoto/`, `assessment/`, `missionbank/`, `participant/`, `phoneutil/`, `frame/`) + 1 white-box `backend/internal/delivery/http/handler/report_photo_resolution_test.go`.
- **No testify/gomock** — hand-rolled in-file fakes implementing `domain/repository` interfaces; handler tests use `httptest` + `echo.New()` with `e.Validator = appmiddleware.NewValidator()`; two GORM repo tests use `go-sqlmock`.
- Recurring per-package helper `requireAppErrorCode(t, err, want)` (duplicated per package, not shared).
- **No test opens a database** — `go test ./...` runs without MariaDB.
- Run: `cd backend && go test ./...`

### Frontend — Vitest 5 + jsdom + Testing Library

- 20 suites in `frontend/tests/unit/**` (+ `i18n/` subfolder) with shared helper `frontend/tests/unit/test-utils.tsx`. Nothing inside `frontend/src/`.
- **Always render through `tests/unit/test-utils.tsx`** — importing `render` from `@testing-library/react` directly hits a React 19.2/RTL act-flush bug that renders nothing.
- Mock services with `vi.mock('@/core/services/...')`; replicate `ApiError` with the same constructor signature so `instanceof` checks work at runtime.
- `vitest.setup.ts` seeds `localStorage['kidversa_lang']='id'` then **dynamically** awaits `./src/core/i18n` — converting to a static import silently breaks locale assumptions.
- Commands: `pnpm test:unit` (watch), `pnpm test:unit:run`, `pnpm test:unit:typecheck` (covers `tests/**`; `pnpm build`'s `tsc -b` does not).
- **No coverage** config, thresholds, or jobs exist.
- `tmp/*.test.mjs` are Node/Puppeteer scripts, not Vitest — they are never picked up by `pnpm test:unit`.

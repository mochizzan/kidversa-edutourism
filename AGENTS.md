# AGENTS.md

## Project Overview

Kidversa Edutourism — interactive digital storytelling platform for children (ages 5–7). Indonesian-language UI.

**Monorepo structure (pnpm workspace):**
- `frontend/` — React 19 + TypeScript + Vite + Tailwind CSS v4 + PWA
- `backend/` — Go + Echo **v5** + GORM + MariaDB 12 (full implementation; migrations in `backend/migrations/`)

> `README.md` is stale. Trust this file and the source over README.

## Commands

### Frontend (`frontend/`)

```bash
cd frontend
pnpm install          # install deps
pnpm dev              # dev server → http://localhost:5173
pnpm build            # build:raport-css → tsc -b → vite build  ← primary verification (no lint/test scripts)
pnpm preview          # preview production build
```

- `pnpm build` is the only CI-equivalent check. Run it after any change.
- `build` first runs `build:raport-css` (`@tailwindcss/cli` compiles `shared/templates/miniRaport.tailwind.css` → `miniRaport.styles.css`, an inlined stylesheet for the printable mini-raport). Edit the `.tailwind.css` source, not the generated `.styles.css`.
- `tsconfig.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports` — every unused import/var is a build error.
- Vite proxies `/api` → `http://localhost:8080`.

### Backend (`backend/`)

### Backend (`backend/`)

### Backend Structure (`backend/`)

```
cmd/           # Entry points: server/ (main), migrate/
internal/
  config/      # Config loading from env
  delivery/    # HTTP layer: handler/ (per-domain routers + handlers), middleware/, dto/
  domain/      # Entity types + repository interfaces
  infrastructure/
    auth/      # JWT, hashing, revoker
    messaging/ # WhatsApp gateway
    migration/ # Golang-migrate runner
    persistence/ # GORM models + repository impls
  pkg/         # Shared: errors, response, SSE hub, util
  usecase/     # Business logic (assessment, live, reports, session)
migrations/    # SQL migration files (golang-migrate format)
```

**Layered architecture**: Handler → UseCase → Repository Interface → GORM Persistence.
All entities use GORM with MariaDB 12 (MySQL driver). The DB uses `gorm.io/driver/mysql` with `go-sql-driver/mysql`.
- Build/verify: `cd backend && go build ./... && go vet ./...`. Migrations: `go run ./cmd/migrate` (needs `APP_ENV=dev` in `backend/.env` + running MariaDB). Tests: `TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=3306 TEST_DB_USER=root TEST_DB_PASSWORD=admin TEST_DB_NAME=kidversa_test go test ./...`.
- Echo **v5** is in `go.mod` (not v4, despite README).
- **CI (`backend/.github/workflows/ci.yml`)** is the source of truth for verification order: `gofmt -l` (fails if non-empty) → `go vet ./...` → `go build ./...` → `go test ./...`. Frontend job: `pnpm install` → `pnpm build`.
- **gofmt is enforced.** Run `gofmt -w .` in `backend/` before committing or the CI lint step fails.
- **Go 1.26** / **Node 20** are the pinned toolchain versions in CI.
- **`go test ./...` requires a running MariaDB 12** (CI spins `mariadb:12` and tests against `kidversa_test` with root/admin). The test env vars above must point at a live DB — tests are integration tests, not unit.

## Architecture

### Frontend Structure (`frontend/src/`)

```
app/          # router.tsx (thin assembler) + routes/ (per-feature route defs), providers/
core/         # config/, constants/, hooks/, services/, stores/, theme/, types/, utils/
features/     # admin/, auth/, fasilitator/, parent/, learner/
shared/       # components/{ui,data,charts,feedback,layout,auth}, hooks/, layouts/, types/, utils/
pages/        # LandingPage, LearnerKioskPage, NotFoundPage
```

### Routing (`app/routes/` + `app/router.tsx`)

- Routes split per feature under `app/routes/` (`auth.tsx`, `admin.tsx`, `fasilitator.tsx`, `parent.tsx`, `learner.tsx`, `index.tsx`). `app/router.tsx` only assembles them via `createBrowserRouter`. Add new routes to the matching `app/routes/<segment>.tsx`.
- `app/routes/helpers.tsx` provides `guardedRoute(path, segment, Component)` (wraps in `RouteGuard` + `SuspenseWrapper`) and `lazyRoute(path, Component)` (Suspense only). Use these instead of hand-writing boilerplate.
- Root `/` → redirects to `/auth/login`.
- `/auth/*` — AuthLayout (Login, Register) — both **eager** imports.
- `/admin/*` — `AdminLayout` with per-route `RouteGuard segment="..."` (NOT `ProtectedRoute`); guards desktop sidebar roles `SUPER_ADMIN`, `ADMIN`, `KOORDINATOR`. Also enforces tenant scope via `TenantGuard`/`tenantScope`.
- `/fasilitator/*` — `ProtectedRoute allowedRoles={[FASILITATOR]}` → `FasilitatorLayout` (mobile-first, bottom nav).
- `/parent/*` — `ParentLayout` (max-width 480px, **no ProtectedRoute** — uses `?token=` via `ParentTokenGuard`).
- `/learner/:sessionId/:stageId` — Learner Kiosk (**public, no auth** — child-facing device).
- `*` → NotFoundPage.

Only `LoginPage` and `RegisterPage` are eager; every other page is lazy-loaded. Do NOT add a `React.lazy` import not consumed by a route — `noUnusedLocals` will fail the build.

### Data Layer (Backend API — IndexedDB removed)

All domain data lives in the **backend** (Go + Echo v5 + GORM + MariaDB 12). The frontend talks to it exclusively through `core/services/backendClient.ts` (`apiRequest`, `getTokens`/`setTokens`, `ApiError`, `openSSE`, `startConnectionWatcher`). **IndexedDB was fully removed** (no `core/services/idb`, `local`, `seed`, `sync`, or `storage/idb.ts`).

- **Auth** runs at app start (`App.tsx` → `backendClient.healthCheck()` then `authStore.checkSession()`). `authStore` (Zustand) persists the user in `sessionStorage` and the access token in memory; refresh is single-flight in `backendClient`. There is no local bootstrap/seed — tenants + users are created by the backend migration (`cmd/migrate` bootstrap: `superadmin@kidversa.id`, `admin.bandung@kidversa.id`, `tenant-bandung`, `tenant-subang`).
- **Service pattern** (domain data, e.g. users/programs/sessions):
  1. Interface in `core/services/types.ts` (e.g. `UserService`, `ProgramService`).
  2. Real API impl in `core/services/<domain>.ts` (e.g. `users.ts`) — calls `apiRequest` against backend routes; no IndexedDB.
  3. Shared helpers in `core/services/apiEnvelope.ts` (`listRequest`/`itemRequest`/`mutateRequest`) handle envelope unwrap, tenant-scoped pagination loops, and the C7 entity transform (e.g. `tenant_id` null→`''`).
- **`tenantStore.ts`** (Zustand): `SUPER_ADMIN` selects an active tenant (`kidversa_active_tenant_id` in `localStorage`); other roles are scoped to their own `tenant_id`. Backend enforces scoping via `TenantScope()` middleware — the frontend only sends `X-Tenant-Id` for super-admin where needed.
- **Live service** (`core/services/live.ts` → backend SSE): `useLiveSession` subscribes to `openSSE('/api/live/:sessionId/stream')`; facilitator overrides (unlock/complete/skip/jump/reset) POST to `/api/live/...`. No local `simulateProgress`.
- **Custom DOM events**: `USERS_CHANGED_EVENT` (`'kidversa:users-changed'`) is listened to by `useHeaderNotifications`; the `dispatchUsersChanged()` emitter was removed (refresh lists via query/invalidation instead).

### State Management

- **Zustand** — `core/stores/authStore.ts` (auth) and `core/stores/tenantStore.ts` (active tenant).
- **TanStack React Query** — installed but **not wired** (no `QueryClientProvider`). All pages use `useState` + `useEffect` with services directly. Don't use `useQuery`/`useMutation` without wiring the provider first.
- **react-hook-form** + **zod** — forms (Login, Register).

### Styling

- **Tailwind CSS v4** — configured via `@theme` in `frontend/src/index.css`. **No `tailwind.config.js`.**
- Brand: primary `#5B2C8D` (purple), accent `#F5A623` (amber) — as CSS custom properties; JS colors in `core/constants/app.ts` → `COLORS`.
- Use `cn()` from `core/utils/cn.ts` (clsx + tailwind-merge) for all conditional classNames — never raw template strings.
- Custom animations in `index.css`: splash, toast, fade, float, etc. Font: Inter (from Google Fonts in `index.html`).

### App Entry Flow

1. `main.tsx` → `<App />` in StrictMode.
2. `App.tsx` → SplashScreen (~3.7s) → `backendClient.healthCheck()` → `authStore.checkSession()`.
3. Auth check: sessionStorage token → restore Zustand state; no token → `/auth/login`.
4. After login: `getRedirectPath()` routes user to role dashboard.

### Key Shared Components (`shared/components/`)

Always check existing components before creating new ones.
- **ui/**: Button, Card, Input, Select, Badge, Modal (portal), Tabs, Tooltip, PageHeader, StarRatingInput (1–5 hover), **AvatarUploadModal**, **CategoryCard**, **CommentInput**, **TenantSwitcher**.
- **data/**: DataTable (generic search/sort/pagination/skeleton), SessionCarousel, TeamList.
- **charts/**: ActivityBarChart (pure CSS), DonutStat.
- **feedback/**: Toast (`useToast` + `ToastContainer`), EmptyState, ErrorBoundary, ErrorState, ConnectionStatus, ConsentGate, **ConfirmDialog** (use `useConfirmDialog` hook for async confirm).
- **auth/**: ProtectedRoute, ParentTokenGuard (`?token=`, provides `useParentToken()`), RouteGuard, **TenantGuard** (blocks when no active tenant).
- **layout/**: AppHeader.

### Key Shared Hooks (`shared/hooks/`)

- `useCrudList` — generic CRUD list with localStorage cache + search/pagination.
- `useConfirmDialog` — reusable confirmation modal with async callback.
- `useGlobalSearch` — admin-wide search with page navigation.
- `useConnectionStatus` — polls CLOUD / EDGE / OFFLINE status.
- `useHeaderNotifications`, `useHighlight` — header/notification + list-row highlight helpers.

### Important Files

| File | Purpose |
|---|---|
| `frontend/src/app/router.tsx` | Route assembler — imports `app/routes/*` |
| `frontend/src/app/routes/helpers.tsx` | `guardedRoute`, `lazyRoute`, `SuspenseWrapper` |
| `frontend/src/app/routes/<segment>.tsx` | Per-feature route definitions |
| `frontend/src/App.tsx` | Root: splash screen + `backendClient.healthCheck()` + `authStore.checkSession()` |
| `frontend/src/core/stores/authStore.ts` | Zustand auth state |
| `frontend/src/core/stores/tenantStore.ts` | Zustand active-tenant state (`kidversa_active_tenant_id`) |
| `frontend/src/core/services/backendClient.ts` | API client: `apiRequest`, `getTokens`/`setTokens`, `ApiError`, `openSSE`, `startConnectionWatcher` |
| `frontend/src/core/services/apiEnvelope.ts` | `listRequest`/`itemRequest`/`mutateRequest` envelope + pagination + C7 transform |
| `frontend/src/core/services/types.ts` | Service interfaces (`UserService`, `ProgramService`, `AuthService`, …) |
| `frontend/src/core/services/<domain>.ts` | Real API service impls (users, programs, sessions, participants, missions, frames, photos, recordings, consent, assessments, reports, participantMissions, tenants) |
| `frontend/src/core/services/live.ts` | Live SSE service (`useLiveSession` → `openSSE('/api/live/:sessionId/stream')`) |
| `frontend/src/core/constants/app.ts` | `ROUTES`, `COLORS`, `USERS_CHANGED_EVENT`, path builders |
| `frontend/src/core/types/entities.ts` | Entity/DTO types |
| `frontend/src/core/types/enums.ts` | All enums incl. `UserRole` |
| `frontend/src/index.css` | Tailwind v4 theme + M3 tokens + animations |
| `frontend/index.html` | HTML entry point — loads Inter font, mounts React app |
| `frontend/vite.config.ts` | Vite + PWA + `/api` proxy |
| `frontend/pnpm-lock.yaml` | Lockfile for reproducible frontend installs |
| `frontend/pnpm-workspace.yaml` | pnpm workspace config (root monorepo) |
| `backend/go.mod` | Go module definition + dependencies |
| `backend/go.sum` | Go module checksums |
| `backend/.env.example` | Template for all backend env vars |
| `backend/docker-compose.yml` | Docker Compose for local backend dev |
| `backend/Dockerfile` | Multi-stage Docker build (golang:1.26 → debian:slim) |
| `backend/.github/workflows/ci.yml` | CI pipeline: gofmt → go vet → go build → go test |
| `backend/.dockerignore` | Excludes uploads, .env, and .exe from Docker context |

## Conventions

- UI text: **Bahasa Indonesia**.
- Feature modules: `features/<role>/pages/`, `features/<role>/components/`, `features/<role>/hooks/`.
- Entity types: `core/types/entities.ts`; enums: `core/types/enums.ts`; constants: `core/constants/app.ts`.
- Navigation paths live in `core/constants/app.ts` → `ROUTES` (nested `AUTH`/`ADMIN`/`FASILITATOR`/`PARENT`). Always use `ROUTES.*`. `ROUTES.AUTH` is an object — use `ROUTES.AUTH.BASE`/`.LOGIN`/`.REGISTER`, never treat it as a string.
- Parameterized path builders also exported from `app.ts`: `programListPath()`, `programDetailPath(id)`, `programStagePath(programId, stageId)`, `contentNewPath({programId, stageId})`, `contentEditPath(contentId, {programId, stageId})`. Prefer these over hardcoded strings.
- New pages: add to the matching `app/routes/<segment>.tsx` as a `React.lazy()` import, consumed by `guardedRoute` or `lazyRoute`.

## Gotchas

- Frontend has **no `.env`** — `VITE_API_BASE_URL` is hardcoded to `http://localhost:8080` in `core/services/backendClient.ts`. The backend **does** use `backend/.env` (gitignored) — backend/.env.example documents every var.
- Gitignored (root `.gitignore`): `node_modules/`, `vendor/`, `dist/`, `*.exe`, `*.db/*.sqlite*`, `.env`, `CLAUDE.md`, `.claude/`, `.codegraph/`, `.kilo/`, `.serena/`, `.hermes/`, `.docs/`, `.img/`, `.plans/`, `docs/`, `img/`. (`docs/` and `img/` are tracked, not ignored.)
- `noUnusedLocals`/`noUnusedParameters` are enabled — every unused import breaks the build.
- TanStack React Query installed but no `QueryClientProvider` — don't use `useQuery` hooks yet.

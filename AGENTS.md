# AGENTS.md

## Project Overview

Kidversa Edutourism — interactive digital storytelling platform for children (ages 5–7). Indonesian-language UI.

**Monorepo structure:**
- `frontend/` — React 19 + TypeScript + Vite + Tailwind CSS v4 + PWA
- `backend/` — Go + Echo **v5** + GORM + SQLite (scaffold only — `go.mod`/`go.sum` exist, no source files yet)

> `README.md` is stale. Trust this file and the source over README.

## Commands

### Frontend (`frontend/`)

```bash
cd frontend
pnpm install          # install deps
pnpm dev              # dev server → http://localhost:5173
pnpm build            # tsc -b && vite build  ← primary verification (no lint/test scripts)
pnpm preview          # preview production build
```

- `pnpm build` is the only CI-equivalent check. Run it after any change.
- `tsconfig.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedSideEffectImports` — every unused import/var is a build error.
- Vite proxies `/api` → `http://localhost:8080`.

### Backend (`backend/`)

- No Go source files exist yet — backend is a stub with dependencies declared only.
- Echo **v5** is declared in `go.mod` (not v4, despite README).

## Architecture

### Frontend Structure (`frontend/src/`)

```
app/          # router.tsx (thin assembler) + routes/ (per-feature route defs), providers/
core/         # config/, constants/, hooks/, services/, stores/, theme/, types/, utils/
features/     # admin/, auth/, fasilitator/, parent/
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

### Data Layer (IndexedDB, not localStorage, not API)

Persistence is **IndexedDB** (via `idb` package) in `core/services/storage/idb.ts` (DB: `kidversa_db`, v2). All CRUD hits IndexedDB stores.

- **Auth/data bootstrap** runs at app start (`App.tsx` → `initDB()` then `runBootstrap()`). `core/services/local/bootstrap.ts` seeds two bootstrap **tenants** (`tenant-bandung`, `tenant-subang`) and the bootstrap **users** once, guarded by the **`kidversa_idb_bootstrapped_v2`** localStorage flag. This is the only seeding wired into the running app.
- Bootstrap accounts (password `password123`):
  | Email | Role | Tenant | Active |
  |---|---|---|---|
  | superadmin@kidversa.id | SUPER_ADMIN | none (global) | yes |
  | admin.bandung@kidversa.id | ADMIN | tenant-bandung | yes |
- `core/services/local/auth.ts` (`localAuthService`, `authSession`, `registerUser`, `approveUser`, `rejectUser`, `deactivateUser`). `authSession` stores token/user in **sessionStorage**.
- **Seed system**: `core/services/seed/init.ts` (`initSeedDatabase`, `resetSeedDatabase`) + `seed/data.ts` seed programs/sessions/participants/etc., guarded by `kidversa_idb_seeded_v1`. NOTE: `initSeedDatabase` is **not called** by `App.tsx` — it exists but is not wired into startup; bootstrap only creates the tenants + 2 users. Don't assume seeded demo data is present in a fresh run.
- **Service pattern** (domain data, e.g. users/programs/sessions):
  1. Interface in `core/services/types.ts` (e.g. `UserService`, `ProgramService`).
  2. IndexedDB-backed impl in `core/services/idb/<domain>.ts` (e.g. `idbUserService`) — namespaced by tenant via `requireTenantId()` from `tenantScope.ts`.
  3. Barrel re-export in `core/services/<domain>.ts` (e.g. `users.ts` → `export const userService = idbUserService`). Swap this barrel to wire a real API.
  - There is **no `core/services/mock/` directory** — older guidance pointing to `mock/db.ts`, `mock/auth.ts`, `mock-accounts.ts`, or `storage/mockDb.ts` is wrong; those files do not exist.
- **`tenantScope.ts`** (`getTenantScope`, `requireTenantId`): `SUPER_ADMIN` operates across tenants and must have an active tenant selected (stored as `kidversa_active_tenant_id` in localStorage / `core/stores/tenantStore.ts`); other roles are scoped to their own `tenant_id`. Calls throw `'Tenant aktif belum dipilih'` if no tenant is set. Most idb services call `requireTenantId()` internally.
- **Live service** (`core/services/live.ts` → `idb/live.ts`): group-stage progress, timeline events, and `simulateProgress` for the admin live dashboard. Progress status enum `GroupStageProgressStatus` (LOCKED/UNLOCKED/IN_PROGRESS/COMPLETED/SKIPPED).
- **Sync manager**: `core/services/sync/syncManager.ts` (`syncManager`, `enqueueSyncItem`, `flushSyncQueue`, …). The top-level `core/services/syncManager.ts` is a **deprecated re-export adapter only** — import from `./sync/syncManager` instead. (The old flush that falsely marked items synced was removed; backend not yet present, so flushing is a no-op.)
- **Custom DOM events**: `dispatchUsersChanged()` (`core/constants/app.ts`) fires `window` event `'kidversa:users-changed'` after user mutations; `useHeaderNotifications` listens via `USERS_CHANGED_EVENT`. Reuse this event for user list refreshes rather than re-fetching manually.
- A real API client scaffold exists at `core/services/backendClient.ts` (`apiRequest`, `healthCheck`, `isBackendEnabled`), gated behind the localStorage flag `kidversa_backend_enabled` (**off by default**). Pages do not call it yet.

### State Management

- **Zustand** — `core/stores/authStore.ts` (auth) and `core/stores/tenantStore.ts` (active tenant).
- **TanStack React Query** — installed but **not wired** (no `QueryClientProvider`). All pages use `useState` + `useEffect` with services directly. Don't use `useQuery`/`useMutation` without wiring the provider first.
- **react-hook-form** + **zod** — forms (Login, Register).

### Styling

- **Tailwind CSS v4** — configured via `@theme` in `frontend/src/index.css`. **No `tailwind.config.js`.**
- Brand: primary `#5B2C8D` (purple), accent `#F5A623` (amber) — as CSS custom properties; JS colors in `core/constants/app.ts` → `COLORS`.
- Use `cn()` from `core/utils/cn.ts` (clsx + tailwind-merge) for all conditional classNames — never raw template strings.
- Custom animations in `index.css`: splash, toast, fade, float, etc. Font: Poppins (from `index.html`).

### App Entry Flow

1. `main.tsx` → `<App />` in StrictMode.
2. `App.tsx` → SplashScreen (~3.7s) → `initDB()` + `runBootstrap()` → `checkSession()`.
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
| `frontend/src/App.tsx` | Root: splash screen + `initDB()` + `runBootstrap()` + session check |
| `frontend/src/core/stores/authStore.ts` | Zustand auth state |
| `frontend/src/core/stores/tenantStore.ts` | Zustand active-tenant state (`kidversa_active_tenant_id`) |
| `frontend/src/core/services/local/auth.ts` | Live auth (`localAuthService`, `authSession`) |
| `frontend/src/core/services/local/bootstrap.ts` | Bootstrap tenants + users, flag `kidversa_idb_bootstrapped_v2` |
| `frontend/src/core/services/seed/init.ts` | Seed system (`initSeedDatabase` — **not wired into startup**) |
| `frontend/src/core/services/types.ts` | Service interfaces (`UserService`, `ProgramService`, `AuthService`, …) |
| `frontend/src/core/services/idb/<domain>.ts` | IndexedDB service impls |
| `frontend/src/core/services/tenantScope.ts` | Tenant scoping (`getTenantScope`, `requireTenantId`) |
| `frontend/src/core/services/live.ts` | Live progress/timeline service |
| `frontend/src/core/services/sync/syncManager.ts` | Sync queue manager (use this, not the deprecated top-level re-export) |
| `frontend/src/core/services/backendClient.ts` | Real API client scaffold (gated by `kidversa_backend_enabled`) |
| `frontend/src/core/services/storage/idb.ts` | IndexedDB wrapper + store defs (`kidversa_db` v2) |
| `frontend/src/core/constants/app.ts` | `ROUTES`, `COLORS`, `USERS_CHANGED_EVENT`, path builders |
| `frontend/src/core/types/entities.ts` | Entity/DTO types |
| `frontend/src/core/types/enums.ts` | All enums incl. `UserRole` |
| `frontend/src/index.css` | Tailwind v4 theme + M3 tokens + animations |
| `frontend/vite.config.ts` | Vite + PWA + `/api` proxy |

## Conventions

- UI text: **Bahasa Indonesia**.
- Feature modules: `features/<role>/pages/`, `features/<role>/components/`, `features/<role>/hooks/`.
- Entity types: `core/types/entities.ts`; enums: `core/types/enums.ts`; constants: `core/constants/app.ts`.
- Navigation paths live in `core/constants/app.ts` → `ROUTES` (nested `AUTH`/`ADMIN`/`FASILITATOR`/`PARENT`). Always use `ROUTES.*`. `ROUTES.AUTH` is an object — use `ROUTES.AUTH.BASE`/`.LOGIN`/`.REGISTER`, never treat it as a string.
- Parameterized path builders also exported from `app.ts`: `programListPath()`, `programDetailPath(id)`, `programStagePath(programId, stageId)`, `contentNewPath({programId, stageId})`, `contentEditPath(contentId, {programId, stageId})`. Prefer these over hardcoded strings.
- New pages: add to the matching `app/routes/<segment>.tsx` as a `React.lazy()` import, consumed by `guardedRoute` or `lazyRoute`.

## Gotchas

- No `.env` files — `VITE_API_BASE_URL` defaults to `http://localhost:8080` (hardcoded in `core/constants/app.ts` and `backendClient.ts`).
- Gitignored: `docs/`, `img/`, `CLAUDE.md`, `.claude/`, `.codegraph/`, `.kilo/`, and the backend binary `kidversa-server`.
- `noUnusedLocals`/`noUnusedParameters` are enabled — every unused import breaks the build.
- TanStack React Query installed but no `QueryClientProvider` — don't use `useQuery` hooks yet.
- Parent routes use `ParentTokenGuard` (`?token=`), not `ProtectedRoute` — they cannot access Zustand auth state.
- Learner Kiosk (`/learner/*`) is fully public, no auth/guard.
- Tailwind v4: no config file — all customization goes in `index.css` under `@theme`.
- No test framework configured — `pnpm build` is the only automated verification.
- `SUPER_ADMIN` must select an active tenant (`TenantSwitcher`) before domain data loads; `requireTenantId()` throws otherwise. Non-super-admin roles are auto-scoped to their own tenant.
- `core/services/syncManager.ts` (top-level) is a deprecated re-export; import from `core/services/sync/syncManager.ts`.
- The seed dataset in `seed/data.ts` is **not** loaded on app start — only bootstrap tenants + 2 users exist after `runBootstrap()`.

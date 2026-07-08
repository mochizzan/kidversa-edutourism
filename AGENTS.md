# AGENTS.md

## Project Overview

Kidversa Edutourism — interactive digital storytelling platform for children (ages 5–7). Indonesian-language UI.

**Monorepo structure:**
- `frontend/` — React 19 + TypeScript 6 + Vite 8 + Tailwind CSS v4 + PWA
- `backend/` — Go 1.26 + Echo **v5** + GORM + SQLite (scaffold only — `go.mod`/`go.sum` exist, no source files yet)

> `README.md` is stale (claims Echo v4, TS 5.x, Vite 6.x, and a `backend/main.go` that doesn't exist). Trust this file and the source over README.

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
- `tsconfig.json` has `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedSideEffectImports` — all unused imports/vars are build errors.
- Vite proxies `/api` → `http://localhost:8080`.

### Backend (`backend/`)

```bash
cd backend
go mod tidy
# No Go source files exist yet — backend is a stub with dependencies declared only
```

- The backend described in `README.md` / `docs/` (main.go, REST endpoints) does not currently exist on disk.
- Echo **v5** is declared in `go.mod` (not v4, despite README claims).

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

- Routes are split per feature under `app/routes/` (`auth.tsx`, `admin.tsx`, `fasilitator.tsx`, `parent.tsx`, `learner.tsx`, `index.tsx`). `app/router.tsx` just assembles them via `createBrowserRouter`. Add new routes to the matching `app/routes/<segment>.tsx`, not `router.tsx`.
- `app/routes/helpers.tsx` provides `guardedRoute(path, segment, Component)` (wraps in `RouteGuard` + `SuspenseWrapper`) and `lazyRoute(path, Component)` (Suspense only). Use these instead of hand-writing boilerplate.
- Root `/` → redirects to `/auth/login`
- `/auth/*` — AuthLayout (Login, Register) — both **eager** imports (not lazy)
- `/admin/*` — `AdminLayout` with per-route `RouteGuard segment="..."` (NOT `ProtectedRoute`); guards desktop sidebar roles `SUPER_ADMIN`, `ADMIN`, `KOORDINATOR`
- `/fasilitator/*` — `ProtectedRoute allowedRoles={[FASILITATOR]}` → `FasilitatorLayout` (mobile-first, bottom nav)
- `/parent/*` — `ParentLayout` (max-width 480px, **no ProtectedRoute** — uses `?token=` query param via `ParentTokenGuard`)
- `/learner/:sessionId/:stageId` — Learner Kiosk (**public, no auth** — child-facing device)
- `*` → NotFoundPage

Only `LoginPage` and `RegisterPage` are eager; every other page is lazy-loaded via `React.lazy()` + `<Suspense>`.

### User Roles

4 roles in `core/types/enums.ts` → `UserRole`: `SUPER_ADMIN`, `ADMIN`, `KOORDINATOR`, `FASILITATOR`. There is **no** `PARENT` role — parent access is token-based, not role-based.

### Mock Data System (local-first, no real API yet)

Persistence is **IndexedDB** (via `idb`), not localStorage. On first run `core/services/storage/mockDb.ts` → `initMockDatabase()` seeds everything from `core/services/mock/data/seed.ts` **once** (guarded by the `kidversa_idb_migrated_v1` localStorage flag). After that, all CRUD reads/writes hit IndexedDB stores.

- `core/services/mock/db.ts` (`mockStorage`) is **legacy/dead** — it's still exported but no longer used by the live data path. Don't build on it.
- Live auth is **`core/services/local/auth.ts`** (`localAuthService`, `authSession`, `registerUser`). It bootstraps users from `MOCK_ACCOUNTS` (`core/config/mock-accounts.ts`, `BOOTSTRAP_PASSWORD = 'password123'`) into IndexedDB. The older `core/services/mock/auth.ts` is **dead code** — ignore it.
- Bootstrap users (password `password123`):
  | Email | Role | Active |
  |---|---|---|
  | admin@kidversa.id | ADMIN | yes |
  | koordinator@kidversa.id | KOORDINATOR | yes |
  | f1@kidversa.id | FASILITATOR | yes |
  | f3@kidversa.id | FASILITATOR | **no** (inactive — cannot log in) |

Service pattern (for domain data, e.g. users/programs/sessions):
1. Interface in `core/services/types.ts`
2. Impl in `core/services/mock/<domain>.ts` (IndexedDB-backed)
3. Re-export barrel in `core/services/<domain>.ts` (e.g. `users.ts` → `mockUserService`) — swap this barrel to wire a real API.

A real API client scaffold exists at `core/services/backendClient.ts` (`apiRequest`, `healthCheck`) but is gated behind the localStorage flag `kidversa_backend_enabled` — **off by default**. Pages do not call it yet.

### State Management

- **Zustand** (`core/stores/authStore.ts`) — auth state, token in sessionStorage
- **TanStack React Query** — installed but **not wired** (no `QueryClientProvider`). All pages use `useState` + `useEffect` with mock services directly. Don't use `useQuery`/`useMutation` without wiring the provider first.
- **react-hook-form** + **zod** — forms (Login, Register)

### Styling

- **Tailwind CSS v4** — configured via `@theme` directive in `frontend/src/index.css`. **No `tailwind.config.js`.**
- Brand: primary `#5B2C8D` (purple), accent `#F5A623` (amber). Full M3 color system as CSS custom properties. (Constants in `core/constants/app.ts` → `COLORS`.)
- Use `cn()` from `core/utils/cn.ts` (clsx + tailwind-merge) for all conditional classNames — never raw template strings.
- Custom animations in `index.css`: splash, toast, fade, float, etc.
- Font: Poppins (loaded from `index.html`).

### App Entry Flow

1. `main.tsx` → `<App />` in StrictMode
2. `App.tsx` → SplashScreen (~3.7s animation), then `checkSession()` → `RouterProvider`
3. Auth check: sessionStorage token → restore Zustand state; no token → `/auth/login`
4. After login: `getRedirectPath()` routes user to role dashboard

### Key Shared Components

Located in `shared/components/`:
- **ui/**: Button, Card, Input, Select, Badge, Modal (portal), Tabs, Tooltip, PageHeader, StarRatingInput (1–5 hover)
- **data/**: DataTable (generic search/sort/pagination/skeleton), SessionCarousel, TeamList
- **charts/**: ActivityBarChart (pure CSS), DonutStat
- **feedback/**: Toast (`useToast` + `ToastContainer`), EmptyState, ErrorBoundary, ErrorState, ConnectionStatus, ConsentGate
- **auth/**: ProtectedRoute, ParentTokenGuard (validates `?token=`, provides `useParentToken()`)

Always check existing shared components before creating new ones.

### Key Shared Hooks (`shared/hooks/`)

- `useCrudList` — generic CRUD list with localStorage cache + search/pagination (used by admin pages)
- `useConfirmDialog` — reusable confirmation modal with async callback
- `useGlobalSearch` — admin-wide search with page navigation
- `useConnectionStatus` — polls CLOUD / EDGE / OFFLINE status
- `useHeaderNotifications`, `useHighlight` — header/notification + list-row highlight helpers

### Important Files

| File | Purpose |
|---|---|
| `frontend/src/app/router.tsx` | Route assembler — imports `app/routes/*` |
| `frontend/src/app/routes/helpers.tsx` | `guardedRoute`, `lazyRoute`, `SuspenseWrapper` |
| `frontend/src/app/routes/<segment>.tsx` | Per-feature route definitions |
| `frontend/src/App.tsx` | Root: splash screen + session check |
| `frontend/src/core/stores/authStore.ts` | Zustand auth state |
| `frontend/src/core/services/local/auth.ts` | Live auth (IndexedDB-backed, `localAuthService`) |
| `frontend/src/core/services/types.ts` | Service interfaces |
| `frontend/src/core/services/backendClient.ts` | Real API client scaffold (gated by `kidversa_backend_enabled` flag) |
| `frontend/src/core/types/entities.ts` | Entity/DTO types |
| `frontend/src/core/types/enums.ts` | All enums incl. UserRole |
| `frontend/src/core/services/mock/db.ts` | localStorage mock DB |
| `frontend/src/core/services/storage/idb.ts` | IndexedDB wrapper (`openDB`, `getAll`, `put`, …) |
| `frontend/src/core/services/storage/mockDb.ts` | `initMockDatabase()` — one-time seed from `mock/data/seed.ts` |
| `frontend/src/core/services/mock/data/seed.ts` | Seed data |
| `frontend/src/index.css` | Tailwind v4 theme + M3 tokens + animations |
| `frontend/vite.config.ts` | Vite + PWA + `/api` proxy |
| `docs/Kidversa_FSD_v1.md` | Functional spec — read before starting a feature |
| `docs/Kidversa_BRD_v3.md` | Business requirements |
| `docs/Kidversa_ERD_v1.md` | Entity-relationship diagram |

## Conventions

- UI text: **Bahasa Indonesia**
- Feature modules: `features/<role>/pages/`, `features/<role>/components/`, `features/<role>/hooks/`
- Entity types: `core/types/entities.ts`; enums: `core/types/enums.ts`; constants: `core/constants/app.ts`
- Navigation paths live in `core/constants/app.ts` → `ROUTES` (nested `AUTH`/`ADMIN`/`FASILITATOR`/`PARENT` objects). Always use `ROUTES.*` instead of hardcoded path strings. The flat `programListPath()`/`programDetailPath()`/`programStagePath()` builders are also exported there (was `core/constants/routes.ts`, now deleted). `ROUTES.AUTH` is an object — use `ROUTES.AUTH.BASE`/`.LOGIN`/`.REGISTER`, never treat it as a string.
- New pages: add to the matching `app/routes/<segment>.tsx` as a `React.lazy()` import (top-level, consumed by `guardedRoute` or `lazyRoute`). Do NOT add a `React.lazy` import that isn't used in a route — `noUnusedLocals` will fail the build.

## Gotchas

- No `.env` files — `VITE_API_BASE_URL` defaults to `http://localhost:8080` (hardcoded in `core/constants/app.ts` and `backendClient.ts`)
- Gitignored: `docs/`, `img/`, `CLAUDE.md`, `.claude/`, `.codegraph/`, `.kilo/`, and the backend binary `kidversa-server`
- `noUnusedLocals`/`noUnusedParameters` are enabled — every unused import breaks the build
- TanStack React Query is installed but has no `QueryClientProvider` — don't use `useQuery` hooks yet without wiring it up first
- Parent routes (`/parent/*`) use `ParentTokenGuard` with `?token=` param, not the standard `ProtectedRoute` — they cannot access Zustand auth state
- Learner Kiosk (`/learner/*`) is fully public with no auth/guard at all
- Tailwind v4: no config file — all customization goes in `index.css` under `@theme`
- No test framework configured — `pnpm build` is the only automated verification

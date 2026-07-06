# AGENTS.md

## Project Overview

Kidversa Edutourism — interactive digital storytelling platform for children (ages 5–7). Indonesian-language UI.

**Monorepo structure:**
- `frontend/` — React 19 + TypeScript 6 + Vite 8 + Tailwind CSS v4 + PWA
- `backend/` — Go 1.26 + Echo **v5** + GORM + SQLite (scaffold only — `go.mod`/`go.sum` exist, no source files yet)

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
- `tsconfig.json` has `strict`, `noUnusedLocals`, `noUnusedParameters` — all unused imports/vars are build errors.
- Vite proxies `/api` → `http://localhost:8080`.

### Backend (`backend/`)

```bash
cd backend
go mod tidy
# No Go source files exist yet — backend is a stub with dependencies declared only
```

- The backend described in `CLAUDE.md` / `docs/` (main.go, REST endpoints) does not currently exist on disk.
- Echo v5 is declared in `go.mod` (not v4).

## Architecture

### Frontend Structure (`frontend/src/`)

```
app/          # router.tsx (all routes), providers/
core/         # config/, constants/, hooks/, services/, stores/, theme/, types/, utils/
features/     # admin/, auth/, fasilitator/, parent/
shared/       # components/{ui,data,charts,feedback,layout,auth}, hooks/, layouts/, types/, utils/
pages/        # LandingPage, NotFoundPage
```

### Routing (`app/router.tsx`)

- Root `/` → redirects to `/auth/login`
- `/auth/*` — AuthLayout (Login, Register)
- `/admin/*` — ProtectedRoute → AdminLayout (desktop, sidebar) for SUPER_ADMIN, ADMIN_WISATA, KOORDINATOR
- `/fasilitator/*` — ProtectedRoute → FasilitatorLayout (mobile-first, bottom nav) for FASILITATOR
- `/parent/*` — ParentLayout (max-width 480px, **no ProtectedRoute** — uses `?token=` query param)

All pages except `ProgramsPage`, `LoginPage`, `RegisterPage` are lazy-loaded via `React.lazy()` + `<Suspense>`.

### User Roles

5 roles in `core/types/enums.ts` → `UserRole`: `SUPER_ADMIN`, `ADMIN_WISATA`, `KOORDINATOR`, `FASILITATOR`, `PARENT`.

### Mock Data System

All frontend services are **localStorage-backed mocks** — no real API calls exist yet.

Service pattern:
1. Interface in `core/services/types.ts`
2. Mock impl in `core/services/mock/` (e.g. `mock/programs.ts`)
3. Re-export in `core/services/<domain>.ts` (swap this file to wire real API)

Mock accounts (`core/config/mock-accounts.ts`), password `password123`:
| Email | Role |
|---|---|
| admin@kidversa.id | ADMIN_WISATA |
| koordinator@kidversa.id | KOORDINATOR |
| f1@kidversa.id | FASILITATOR |

Mock DB utility: `core/services/mock/db.ts` (localStorage via `mockStorage`).  
Seed data: `core/services/mock/data/seed.ts`.

### State Management

- **Zustand** (`core/stores/authStore.ts`) — auth state, token in sessionStorage
- **TanStack React Query** — installed but **not wired** (no `QueryClientProvider`). All pages use `useState` + `useEffect` with mock services directly.
- **react-hook-form** + **zod** — forms (Login, Register)

### Styling

- **Tailwind CSS v4** — configured via `@theme` directive in `frontend/src/index.css`. **No `tailwind.config.js`.**
- Brand: primary `#5B2C8D` (purple), accent `#F5A623` (amber). Full M3 color system as CSS custom properties.
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

### Important Files

| File | Purpose |
|---|---|
| `frontend/src/app/router.tsx` | All route definitions |
| `frontend/src/App.tsx` | Root: splash screen + session check |
| `frontend/src/core/stores/authStore.ts` | Zustand auth state |
| `frontend/src/core/services/types.ts` | 12 service interfaces |
| `frontend/src/core/types/entities.ts` | Entity/DTO types |
| `frontend/src/core/types/enums.ts` | All enums incl. UserRole |
| `frontend/src/core/services/mock/db.ts` | localStorage mock DB |
| `frontend/src/core/services/mock/data/seed.ts` | Seed data |
| `frontend/src/index.css` | Tailwind v4 theme + M3 tokens + animations |
| `frontend/vite.config.ts` | Vite + PWA + `/api` proxy |
| `docs/internal/FRONTEND_BUILD_BLUEPRINT_v1.md` | Build roadmap, feature scoring, UX mockups — read before starting a feature |

## Conventions

- UI text: **Bahasa Indonesia**
- Feature modules: `features/<role>/pages/`, `features/<role>/components/`, `features/<role>/hooks/`
- Entity types: `core/types/entities.ts`; enums: `core/types/enums.ts`; constants: `core/constants/app.ts`
- New pages: add to `router.tsx` as `React.lazy()` import with `<Suspense>` fallback

## Gotchas

- No `.env` files — `VITE_API_BASE_URL` defaults to `http://localhost:8080` (hardcoded in constants)
- Backend binary `kidversa-server` is gitignored; `docs/`, `img/`, `.claude/`, `.codegraph/`, `.kilo/` are gitignored
- `noUnusedLocals`/`noUnusedParameters` are enabled — every unused import breaks the build
- TanStack React Query is installed but has no `QueryClientProvider` — don't use `useQuery` hooks yet without wiring it up first
- Parent routes (`/parent/*`) use `ParentTokenGuard` with `?token=` param, not the standard `ProtectedRoute` — they cannot access Zustand auth state
- Tailwind v4: no config file — all customization goes in `index.css` under `@theme`
- No test framework configured — `pnpm build` is the only automated verification

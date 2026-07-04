# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend (React + Vite + TypeScript)
cd frontend
pnpm install           # Install dependencies
pnpm dev               # Start dev server at http://localhost:5173
pnpm build             # Type-check (tsc -b) then bundle (vite build)
pnpm preview           # Preview production build

# Backend (Go + Echo + GORM + SQLite)
cd backend
go mod tidy            # Sync dependencies
go run .               # Start server at http://localhost:8080
go build -o kidversa-server .   # Build binary
```

- No ESLint, Prettier, or test framework is configured yet.
- TypeScript strict mode provides type checking via `pnpm build` (`tsc -b`).
- Mock accounts for login: see `frontend/src/core/config/mock-accounts.ts` (default password: `password123`).

## Project Overview

Kidversa is a Digital Storytelling Edutourism platform for children (ages 5-7). It serves three PWAs from one codebase:

1. **Kidversa Web** — Admin Wisata & Koordinator (desktop/tablet, `/admin/*`)
2. **Kidversa Mobile** — Fasilitator (smartphone PWA, `/fasilitator/*`)
3. **Kidversa Parent** — Parents/Wali (mobile, `/parent/*`)

The project is in an early **mock-first** phase — all frontend services are localStorage-backed mock implementations. Real backend API integration via TanStack React Query is planned but not wired up.

## Architecture

### Frontend (React 19 + Vite 8 + TypeScript 6 + Tailwind CSS 4)

Feature-based modular structure under `frontend/src/`:

```
src/
├── app/          # App wiring: router (createBrowserRouter), providers
├── core/         # Shared infrastructure
│   ├── config/       # Mock accounts, constants
│   ├── constants/    # APP_NAME, API_BASE_URL, ROUTES, API_ENDPOINTS
│   ├── hooks/        # useAuth, useLiveSession
│   ├── services/     # Service interfaces + mock implementations
│   │   ├── mock/         # localStorage-backed mock services
│   │   └── types.ts      # Service interface contracts (ProgramService, SessionService, etc.)
│   ├── stores/      # Zustand stores (authStore)
│   ├── theme/       # Brand color tokens
│   ├── types/       # All entity types, enums, API DTOs
│   └── utils/       # cn(), formatDate(), generateId(), sleep()
├── features/      # Domain feature modules
│   ├── admin/      # pages/, components/, hooks/, mock/
│   ├── auth/       # pages/ (Login, Register)
│   ├── fasilitator/ # pages/ (Dashboard, Activities)
│   └── parent/     # pages/ (Dashboard, Stories)
├── shared/        # Reusable cross-feature code
│   ├── components/ # auth/, charts/, data/, feedback/, layout/, ui/
│   ├── layouts/    # AdminLayout, AuthLayout, MainLayout
│   └── utils/      # formatDate, formatFileSize, truncate
└── pages/         # LandingPage, NotFoundPage
```

### Backend (Go + Echo + GORM + SQLite)

Single-file server at `backend/main.go` with:
- 2 models: Story and Destination
- 4 REST endpoints: `GET/POST /api/stories`, `GET/POST /api/destinations`
- CORS configured for `localhost:5173` and `localhost:3000`
- Health check at `/health`
- Port configurable via `PORT` env var (default `8080`)

The existing backend is a minimal scaffold — the full spec (docs/) describes 18 modules with MySQL, auth, MinIO, and Claude API integrations that are not yet implemented.

### State Management

- **Zustand** for global auth state (`useAuthStore` — user, token, isAuthenticated, login/logout).
- **TanStack React Query** is installed but not yet wired up (no QueryClientProvider). All pages currently use `useState` + `useEffect` with mock services.
- **react-hook-form** + **zod** for form validation (LoginPage, RegisterPage).

### Routing

All routes in `src/app/router.tsx` using `createBrowserRouter`:
- `/auth/*` — `AuthLayout` (Login, Register)
- `/admin/*` — `AdminLayout` + `ProtectedRoute` (dashboard, programs, sessions, content, frames, users)
- `/fasilitator/*` — `AdminLayout` + `ProtectedRoute` (dashboard, activities)
- `/parent/*` — `MainLayout` + `ProtectedRoute` (dashboard, stories)

All pages are lazy-loaded via `React.lazy()` with a `<Suspense>` spinner fallback.

### Auth & Roles

- `ProtectedRoute` checks `isAuthenticated` from Zustand store, redirects to `/auth/login?returnUrl=...` if not authenticated.
- Five roles (`UserRole` enum): `SUPER_ADMIN`, `ADMIN_WISATA`, `KOORDINATOR`, `FASILITATOR`, `PARENT`.
- `getRedirectPath()` routes users to the correct dashboard after login based on role.
- Auth is entirely mock-based — token stored in `sessionStorage`, no real JWT validation.

### Styling

- **Tailwind CSS v4** with `@theme` directive defining brand colors (purple `#5B2C8D` / amber `#F5A623`).
- Material Design 3 color system tokens as CSS custom properties (--color-surface-container-low, --color-primary-container, etc.).
- `cn()` utility (clsx + tailwind-merge) for conditional class merging — always use this instead of raw template strings for className.
- Google Font "Poppins" loaded from `index.html`.
- Primary UI language: Indonesian (id).

### Shared Components

Located in `src/shared/components/`:
- **ui/**: Button, Card, Input, Select, Badge, Modal (portal-based), Tabs, Tooltip, PageHeader
- **data/**: DataTable (generic, with search/sort/pagination/skeleton/empty state), SessionCarousel
- **feedback/**: EmptyState, Toast (useToast hook + ToastContainer)
- **charts/**: ActivityBarChart (pure CSS), DonutStat
- Always check existing shared components before creating new ones.

### Data Layer Pattern

Each domain has a service interface and a mock implementation:
1. Interface in `src/core/services/types.ts` (e.g., `ProgramService`)
2. Mock implementation in `src/core/services/mock/` (e.g., `mock/programs.ts`)
3. Re-export in `src/core/services/` (e.g., `programs.ts` re-exports `mockProgramService`)

To swap from mock to real API: replace the re-export in step 3 with a real implementation.

### Key Entity Types

See `src/core/types/entities.ts` and `src/core/types/enums.ts` for the full data model. Major entities:
- **Program** → ProgramStage → StageContent
- **Session** → SessionStage, SessionGroup → Participant
- **User** (with role), **PhotoFrame**, **SmartPhoto**, **Recording**, **Assessment**, **Report**, **MissionBank**

Sync status enums (`SyncStatus`, `SyncQueueStatus`, `ConnectionStatus`) reflect the planned offline-first architecture.

### Key Files

| File | Purpose |
|------|---------|
| `frontend/src/app/router.tsx` | All route definitions |
| `frontend/src/core/stores/authStore.ts` | Zustand auth state |
| `frontend/src/core/services/types.ts` | Service interfaces |
| `frontend/src/core/types/entities.ts` | Entity/DTO types |
| `frontend/src/core/types/enums.ts` | All enums |
| `frontend/src/core/config/mock-accounts.ts` | Dev login accounts |
| `frontend/src/core/services/mock/db.ts` | localStorage mock DB |
| `frontend/src/shared/components/ui/Button.tsx` | Button (reference for component pattern) |
| `frontend/src/shared/components/data/DataTable.tsx` | Generic data table |
| `frontend/src/shared/layouts/AdminLayout.tsx` | Admin sidebar + header layout |
| `frontend/src/index.css` | Tailwind v4 theme + M3 tokens |
| `frontend/vite.config.ts` | Vite + PWA + proxy config |
| `backend/main.go` | Go server entry point |
| `docs/` | BRD, FSD, ERD documentation |

### Offline/PWA Architecture (Planned)

The FSD describes an offline-first architecture where:
- Data is stored locally in IndexedDB first
- Service Worker uses network-first caching
- When offline, a local Edge mini-PC serves as fallback
- Sync engine reconciles data when connectivity returns
- These features are not yet implemented

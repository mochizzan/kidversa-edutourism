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

### Key Planning Document

The entire build roadmap, feature scoring, UI mockups, business rules, and gap analysis live in:
**`docs/internal/FRONTEND_BUILD_BLUEPRINT_v1.md`** — read this FIRST before starting on any feature to understand priority, existing state, and intended UX.

Three specification docs also exist at `docs/`:
- `Kidversa_BRD_v3.md` — Business Requirements Document
- `Kidversa_FSD_v1.md` — Functional Specification Document
- `Kidversa_ERD_v1.md` — Entity Relationship Diagram

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
│   ├── theme/       # Brand color tokens (empty barrel — tokens are in index.css)
│   ├── types/       # All entity types, enums, API DTOs
│   └── utils/       # cn(), formatDate(), generateId(), sleep()
├── features/      # Domain feature modules
│   ├── admin/      # pages/, components/, hooks/, mock/
│   ├── auth/       # pages/ (Login, Register)
│   ├── fasilitator/ # pages/ (Dashboard — needs refactor, Activities — needs refactor)
│   └── parent/     # pages/ (Dashboard — needs refactor, Stories — needs refactor)
├── shared/        # Reusable cross-feature code
│   ├── components/ # auth/, charts/, data/, feedback/, layout/, ui/
│   ├── hooks/      # useCrudList, useConfirmDialog, useGlobalSearch, useHighlight
│   ├── layouts/    # AdminLayout, AuthLayout, MainLayout
│   ├── types/      # DashboardStats, StageAverage, RatingDistribution, etc.
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
- Root `/` redirects to `/auth/login`
- `/auth/*` — `AuthLayout` (Login, Register)
- `/admin/*` — `AdminLayout` + `ProtectedRoute` (allowedRoles: SUPER_ADMIN, ADMIN_WISATA, KOORDINATOR) → dashboard, programs/:programId, sessions/:sessionId, content, frames, frames/upload, users
- `/fasilitator/*` — `AdminLayout` + `ProtectedRoute` (allowedRoles: FASILITATOR) → dashboard, activities
- `/parent/*` — `MainLayout` + `ProtectedRoute` (allowedRoles: PARENT) → dashboard, stories

All pages except ProgramsPage are lazy-loaded via `React.lazy()` with a `<Suspense>` spinner fallback.

### Auth & Roles

- `ProtectedRoute` checks `isAuthenticated` from Zustand store, redirects to `/auth/login?returnUrl=...` if not authenticated.
- Five roles (`UserRole` enum): `SUPER_ADMIN`, `ADMIN_WISATA`, `KOORDINATOR`, `FASILITATOR`, `PARENT`.
- `getRedirectPath()` routes users to the correct dashboard after login based on role.
- Auth is entirely mock-based — token stored in `sessionStorage`, no real JWT validation.
- Login rate limiting exists via `features/auth/hooks/useRateLimit.ts`.

### Styling

- **Tailwind CSS v4** with `@theme` directive defining brand colors (purple `#5B2C8D` / amber `#F5A623`).
- Material Design 3 color system tokens as CSS custom properties (--color-surface-container-low, --color-primary-container, etc.).
- `cn()` utility (clsx + tailwind-merge) for conditional class merging — always use this instead of raw template strings for className.
- Google Font "Poppins" loaded from `index.html`.
- Primary UI language: Indonesian (id).

### Shared Components

Located in `src/shared/components/`:
- **ui/**: Button, Card, Input, Select, Badge, Modal (portal-based), Tabs, Tooltip, PageHeader, CategoryCard
- **data/**: DataTable (generic, with search/sort/pagination/skeleton/empty state), SessionCarousel, TeamList
- **charts/**: ActivityBarChart (pure CSS), DonutStat
- **feedback/**: EmptyState, Toast (useToast hook + ToastContainer), ErrorBoundary
- **layout/**: AppHeader
- **auth/**: ProtectedRoute
- Always check existing shared components before creating new ones.

### Shared Hooks

Located in `src/shared/hooks/`:
- **useCrudList** — generic CRUD list with localStorage cache + search/pagination for admin pages (Programs, Sessions, Users, Content)
- **useConfirmDialog** — reusable confirmation modal with async callback pattern (used for deletes, toggles)
- **useGlobalSearch** — admin-wide search that navigates to the correct page on match
- **useHighlight** — text highlighting utility for search results

Feature-specific hooks:
- **useFrameUploadQueue** (`features/admin/hooks/`) — drag-drop, file validation (PNG/JPEG, max 2MB), multi-upload, save queue
- **useRateLimit** (`features/auth/hooks/`) — login attempt rate limiting (countdown, max attempts)
- **useAuth** (`core/hooks/`) — convenience wrapper around authStore
- **useLiveSession** (`core/hooks/`) — session polling for live monitoring (not yet used by any page)

### Data Layer Pattern

Each domain has a service interface and a mock implementation:
1. Interface in `src/core/services/types.ts` (e.g., `ProgramService`)
2. Mock implementation in `src/core/services/mock/` (e.g., `mock/programs.ts`)
3. Re-export in `src/core/services/` (e.g., `programs.ts` re-exports `mockProgramService`)

To swap from mock to real API: replace the re-export in step 3 with a real implementation.

Currently implemented services (12 interfaces, 4 mock implementations):
- Programs, Sessions, Users, Frames — have full mock CRUD
- Auth — mock login/logout with sessionStorage
- Photos, Recordings, Reports, Consent, Assessments, LiveSession, Missions — interfaces defined but NO mock implementations yet

Admin mock data for dashboard lives in `features/admin/mock/dashboard.ts` with typed interfaces in `shared/types/dashboard.ts`.

### Key Entity Types

See `src/core/types/entities.ts` and `src/core/types/enums.ts` for the full data model. Major entities:
- **Program** → ProgramStage → StageContent
- **Session** → SessionStage, SessionGroup → Participant
- **User** (with role), **PhotoFrame**, **SmartPhoto**, **Recording**, **Assessment**, **Report**, **MissionBank**

Sync status enums (`SyncStatus`, `SyncQueueStatus`, `ConnectionStatus`) reflect the planned offline-first architecture.

### App Entry Points

- **App.tsx** — Root component with splash screen animation (logo pop → text slide → fade exit, ~3.7s total), then checkSession → RouterProvider. Wraps everything in ErrorBoundary + ToastProvider.
- **main.tsx** — StrictMode mount of `<App />`.
- **router.tsx** — All route definitions with lazy loading.

### PWA Configuration

- **vite.config.ts** — `vite-plugin-pwa` with autoUpdate, Workbox globPatterns, manifest (Kidversa branding, purple theme, standalone display, 192+512 icons)
- **Service Worker** (`public/sw.js`) — Network-first strategy, precaches 11 SPA routes, offline fallback page
- **Offline page** (`public/offline.html`) — Styled "Anda Sedang Offline" fallback with reload button
- **Gaps**: No frame PNG cache-first strategy, no stage content cache-on-demand, no background sync API for offline upload, no PWA install prompt handler

### App Flow

1. User opens app → SplashScreen (~3.7s)
2. `checkSession()` runs — if valid token in sessionStorage, restore auth state
3. If not authenticated → redirect to `/auth/login`
4. Login with mock credentials → Zustand store updated → `getRedirectPath()` navigates based on role
5. All data operations are localStorage-backed via `mockStorage` utility (`core/services/mock/db.ts`)

### Key Files

| File | Purpose |
|------|---------|
| `frontend/src/app/router.tsx` | All route definitions |
| `frontend/src/App.tsx` | Root with splash screen + session check |
| `frontend/src/core/stores/authStore.ts` | Zustand auth state |
| `frontend/src/core/services/types.ts` | 12 service interfaces |
| `frontend/src/core/types/entities.ts` | Entity/DTO types |
| `frontend/src/core/types/enums.ts` | All enums |
| `frontend/src/core/config/mock-accounts.ts` | Dev login accounts |
| `frontend/src/core/services/mock/db.ts` | localStorage mock DB |
| `frontend/src/core/services/mock/data/seed.ts` | Seed data for all mock tables |
| `frontend/src/shared/components/ui/Button.tsx` | Button (reference for component pattern) |
| `frontend/src/shared/components/data/DataTable.tsx` | Generic data table |
| `frontend/src/shared/hooks/useCrudList.ts` | Generic CRUD hook used by admin pages |
| `frontend/src/shared/layouts/AdminLayout.tsx` | Admin sidebar + header layout |
| `frontend/src/index.css` | Tailwind v4 theme + M3 tokens + custom animations |
| `frontend/vite.config.ts` | Vite + PWA + proxy config |
| `frontend/src/features/admin/mock/dashboard.ts` | Admin dashboard mock data |
| `frontend/src/shared/types/dashboard.ts` | Dashboard type interfaces |
| `backend/main.go` | Go server entry point |
| `docs/internal/FRONTEND_BUILD_BLUEPRINT_v1.md` | **Critical** — build roadmap, feature scoring, UX mockups |
| `docs/` | BRD, FSD, ERD documentation |

### Offline/PWA Architecture (Planned)

The FSD describes an offline-first architecture where:
- Data is stored locally in IndexedDB first
- Service Worker uses network-first caching
- When offline, a local Edge mini-PC serves as fallback
- Sync engine reconciles data when connectivity returns
- These features are not yet implemented

### Feature Implementation Status

Per the build blueprint (16% overall), the admin module has the most complete feature set:

**✅ Implemented:**
- Auth (login, register, role-based redirect, rate limiting)
- Program CRUD + stages + content management (with dnd-kit reorder)
- Session CRUD + facilitator assignment + groups + participants
- Frame manager (upload, list, assign to program)
- User management
- Admin dashboard with charts (ActivityBarChart, DonutStat)
- Splash screen, error boundary, toast notifications
- PWA manifest + service worker + offline page

**❌ Not Yet Built (highest priority per blueprint v2.9):**
- Live Monitor / Stage Engine (Koordinator real-time group tracking)
- FasilitatorDashboard refactor (mobile-first, live session data)
- Group participant list + child assessment (star rating 1-5)
- FasilitatorLayout with bottom navigation (mobile)
- ConnectionStatus + offline indicator
- Camera/recording (SmartPhoto + Audio/video recording)
- Report generation + review + consent flow
- Parent portal (report view + missions)
- Assessment, Photo, Recording, Report, Consent, Mission mock services + seed data

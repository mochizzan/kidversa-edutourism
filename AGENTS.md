# AGENTS.md

## Project Overview

Kidversa Edutourism — platform interaktif cerita digital untuk anak usia 5–7 tahun. UI berbahasa Indonesia.

**Monorepo structure:**
- `frontend/` — React 19 + TypeScript 6 + Vite 8 + Tailwind CSS v4 + PWA
- `backend/` — Go 1.26 + Echo v5 + GORM + MariaDB 12
- `docs/` — BRD, ERD, FSD, template mini-raport

> `README.md` is stale. Trust this file and the source over README.

## Commands

### Frontend (`frontend/`)

```bash
cd frontend
pnpm install          # install deps
pnpm dev              # dev server → http://localhost:5173
pnpm build            # build:raport-css → tsc -b → vite build  ← primary verification
pnpm preview          # preview production build
```

- `pnpm build` is the only CI-equivalent check. Run it after any change.
- `build` first runs `build:raport-css` (`@tailwindcss/cli` compiles `shared/templates/miniRaport.tailwind.css` → `miniRaport.styles.css`). Edit the `.tailwind.css` source, not the generated `.styles.css`.
- `tsconfig.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports` — every unused import/var is a build error.
- Vite proxies `/api` → `http://localhost:8080`.
- **No test, lint, or format scripts exist.** `pnpm build` is the sole verification.

### Backend (`backend/`)

```bash
cd backend
go build ./...        # compilation check
go vet ./...          # static analysis
gofmt -w .            # format (enforced in CI)
go run ./cmd/migrate  # run migrations + bootstrap (needs .env + MariaDB)
go test ./...         # integration tests (needs MariaDB 12 running)
```

- **CI (`backend/.github/workflows/ci.yml`)** verification order: `gofmt -l` → `go vet ./...` → `go build ./...` → `go test ./...`.
- **gofmt is enforced.** Run `gofmt -w .` in `backend/` before committing.
- **`go test ./...` requires MariaDB 12** (CI spins `mariadb:12` service container). Currently **no test files exist** — CI passes vacuously.
- Echo **v5** (not v4).

### Backend Structure (`backend/`)

```
cmd/
  server/main.go      # API server entry point
  migrate/main.go     # Migration runner + bootstrap/seeding
internal/
  config/             # Config loading from env (godotenv)
  delivery/http/
    handler/          # HTTP handlers + route registration (router_*.go)
    middleware/        # JWT, CORS, rate limit, tenant scope, error handler
    dto/              # Request/response DTOs
  domain/
    entity/           # Domain entity types
    repository/       # Repository interfaces
  infrastructure/
    ai/               # OpenRouter narrative generator
    auth/             # JWT, hashing, revoker, kiosk store
    messaging/        # WhatsApp gateway
    migration/        # Golang-migrate runner
    persistence/      # GORM models + repository implementations
  pkg/
    errors/           # App error types (Internal, NotFound, etc.)
    response/         # JSON response helpers (OK, Fail, etc.)
    sse/              # SSE hub for real-time streaming
    util/             # Shared utilities
  usecase/            # Business logic
    assessment/       # Child assessment logic
    live/             # Live session + SSE streaming
    reports/          # Report generation + WhatsApp sending
    session.go        # Session CRUD + lifecycle
migrations/           # SQL migration files (golang-migrate format, 000001–000012)
```

**Layered architecture**: Handler → UseCase → Repository Interface → GORM Persistence.

## Architecture

### Frontend Structure (`frontend/src/`)

```
app/          # router.tsx (assembler) + routes/ (per-feature route defs)
core/
  config/     # App configuration
  constants/  # ROUTES, COLORS, apiRoutes, USERS_CHANGED_EVENT
  hooks/      # useAuth, useLiveSession, useTenantScope
  services/   # API client + domain services
  stores/     # Zustand stores (auth, tenant)
  theme/      # Theme configuration
  types/      # entities.ts, enums.ts, api.ts
  utils/      # cn(), raportCapture, etc.
features/
  admin/      # Admin dashboard pages + components + hooks
  auth/       # Login, Register pages
  fasilitator/ # Facilitator mobile-first pages + components + hooks
  learner/    # LearnerKioskPage (child-facing device)
  parent/     # Parent consent, missions, report pages
shared/
  components/
    auth/     # ProtectedRoute, RouteGuard, TenantGuard, ParentTokenGuard
    charts/   # ActivityBarChart, DonutStat
    data/     # DataTable, SessionCarousel, TeamList
    feedback/ # Toast, EmptyState, ErrorBoundary, ErrorState, ConnectionStatus, ConsentGate, ConfirmDialog
    layout/   # AppHeader
    ui/       # Button, Card, Input, Select, Badge, Modal, Tabs, Tooltip, PageHeader, StarRatingInput, AvatarUploadModal, CategoryCard, CommentInput, TenantSwitcher, Logo, Skeleton, Spinner, LoadingButton
  hooks/      # useCrudList, useConfirmDialog, useGlobalSearch, useConnectionStatus, useConsentProgress, useHeaderNotifications, useHighlight
  layouts/    # AdminLayout, AuthLayout, FasilitatorLayout, MainLayout, ParentLayout
  templates/  # Mini-raport CSS template
  utils/      # Shared utilities (truncate, etc.)
pages/        # LandingPage, NotFoundPage
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

### All Admin Pages (`features/admin/pages/`)

| Page | Purpose |
|------|---------|
| `DashboardPage` | Admin dashboard with stats |
| `ProgramsPage` | List all programs |
| `ProgramDetailPage` | Program details |
| `ProgramStagePage` | Manage program stages |
| `ContentPage` | List content for a stage |
| `ContentFormPage` | Create/edit content |
| `SessionsPage` | List all sessions |
| `SessionDetailPage` | Session details + tabs |
| `ParticipantsPage` | List participants |
| `ParticipantDetailPage` | Participant details |
| `ParticipantFormPage` | Create/edit participant |
| `UsersPage` | List users |
| `UserFormPage` | Create/edit user |
| `TenantsPage` | List tenants |
| `FramesPage` | List photo frames |
| `FrameFormPage` | Create/edit frame |
| `FrameUploadPage` | Upload frame image |
| `LiveMonitorPage` | Live session monitoring |
| `MissionBankPage` | Mission bank management |
| `MissionFormPage` | Create/edit mission |
| `ConsentMonitorPage` | Consent status monitoring |
| `RecordingDetailPage` | Recording details |
| `RecordingReviewPage` | Review recordings |
| `ReportListPage` | List reports |
| `ReportReviewPage` | Review reports |
| `ReportSessionPage` | Session-specific reports |

### All Facilitator Pages (`features/fasilitator/pages/`)

| Page | Purpose |
|------|---------|
| `DashboardPage` | Facilitator dashboard |
| `ActivitiesPage` | List assigned activities |
| `GroupsPage` | List groups |
| `GroupPage` | Group details + stage progress |
| `CameraPage` | Camera capture |
| `SmartPhotoPage` | Smart photo with canvas drawing |
| `RecordingPage` | Audio/video recording |
| `ChildAssessmentPage` | Child assessment form |
| `ProfilePage` | Facilitator profile |

### All Parent Pages (`features/parent/pages/`)

| Page | Purpose |
|------|---------|
| `ConsentFormPage` | Parent consent form (Ya/Tidak choices) |
| `MissionsPage` | View/toggle missions |
| `ReportPage` | View report (PDF/PNG download) |

### Learner Pages (`features/learner/pages/`)

| Page | Purpose |
|------|---------|
| `LearnerKioskPage` | Child-facing kiosk (public, no auth) |

### Data Layer (Backend API — IndexedDB removed)

All domain data lives in the **backend** (Go + Echo v5 + GORM + MariaDB 12). The frontend talks to it exclusively through `core/services/backendClient.ts` (`apiRequest`, `getTokens`/`setTokens`, `ApiError`, `openSSE`, `startConnectionWatcher`). **IndexedDB was fully removed** (no `core/services/idb`, `local`, `seed`, `sync`, or `storage/idb.ts`).

- **Auth** runs at app start (`App.tsx` → `backendClient.healthCheck()` then `authStore.checkSession()`). `authStore` (Zustand) persists the user in `sessionStorage` and the access token in memory; refresh is single-flight in `backendClient`. There is no local bootstrap/seed — tenants + users are created by the backend migration (`cmd/migrate` bootstrap: `superadmin@kidversa.id`, `admin.bandung@kidversa.id`, `tenant-bandung`, `tenant-subang`).
- **Service pattern** (domain data, e.g. users/programs/sessions):
  1. Interface in `core/services/types.ts` (e.g. `UserService`, `ProgramService`).
  2. Real API impl in `core/services/<domain>.ts` (e.g. `users.ts`) — calls `apiRequest` against backend routes; no IndexedDB.
  3. Shared helpers in `core/services/apiEnvelope.ts` (`listRequest`/`itemRequest`/`mutateRequest`/`arrayRequest`/`voidRequest`/`nullableItemRequest`) handle envelope unwrap, tenant-scoped pagination loops, and the C7 entity transform (e.g. `tenant_id` null→`''`).
- **`tenantStore.ts`** (Zustand): `SUPER_ADMIN` selects an active tenant (`kidversa_active_tenant_id` in `localStorage`); other roles are scoped to their own `tenant_id`. Backend enforces scoping via `TenantScope()` middleware — the frontend only sends `X-Tenant-Id` for super-admin where needed.
- **Live service** (`core/services/live.ts` → backend SSE): `useLiveSession` subscribes to `openSSE('/api/live/:sessionId/stream')`; facilitator overrides (unlock/complete/skip/jump/reset) POST to `/api/live/...`. No local `simulateProgress`.
- **Custom DOM events**: `USERS_CHANGED_EVENT` (`'kidversa:users-changed'`) is listened to by `useHeaderNotifications`; the `dispatchUsersChanged()` emitter was removed (refresh lists via query/invalidation instead).

### All Frontend Services (`core/services/`)

| Service | File | Purpose |
|---------|------|---------|
| `AuthService` | `types.ts` | Login, register, refresh, me, logout |
| `UserService` | `users.ts` | CRUD users, approve/reject/deactivate |
| `ProgramService` | `programs.ts` | CRUD programs, stages, contents |
| `SessionService` | `sessions.ts` | CRUD sessions, lifecycle (start/complete/cancel) |
| `ParticipantService` | `participants.ts` | CRUD participants |
| `FrameService` | `frames.ts` | CRUD photo frames |
| `PhotoService` | `photos.ts` | CRUD photos |
| `RecordingService` | `recordings.ts` | CRUD recordings |
| `ReportService` | `reports.ts` | CRUD reports, generate, approve, send |
| `ConsentService` | `consent.ts` | Consent management |
| `AssessmentService` | `assessments.ts` | CRUD assessments |
| `MissionBankService` | `types.ts` | CRUD mission bank |
| `ParticipantMissionsService` | `participantMissions.ts` | CRUD participant missions |
| `TenantService` | `tenants.ts` | CRUD tenants |
| `live.ts` | `live.ts` | SSE streaming + live overrides |

### All Custom Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAuth` | `core/hooks/useAuth.ts` | Auth state access |
| `useLiveSession` | `core/hooks/useLiveSession.ts` | SSE live session subscription |
| `useTenantScope` | `core/hooks/useTenantScope.ts` | Tenant context |
| `useCrudList` | `shared/hooks/useCrudList.ts` | Generic CRUD list with localStorage cache |
| `useConfirmDialog` | `shared/hooks/useConfirmDialog.ts` | Reusable confirmation modal |
| `useGlobalSearch` | `shared/hooks/useGlobalSearch.ts` | Admin-wide search |
| `useConnectionStatus` | `shared/hooks/useConnectionStatus.ts` | CLOUD/EDGE/OFFLINE polling |
| `useConsentProgress` | `shared/hooks/useConsentProgress.ts` | Consent progress tracking |
| `useHeaderNotifications` | `shared/hooks/useHeaderNotifications.ts` | Header notifications |
| `useHighlight` | `shared/hooks/useHighlight.ts` | List-row highlight |
| `useCamera` | `features/fasilitator/hooks/useCamera.ts` | Camera capture |
| `useMediaRecorder` | `features/fasilitator/hooks/useMediaRecorder.ts` | Audio/video recording |
| `useSmartPhotos` | `features/fasilitator/hooks/useSmartPhotos.ts` | Smart photo management |
| `useFacilitatorProfile` | `features/fasilitator/hooks/useFacilitatorProfile.ts` | Facilitator profile |
| `useChildAssessment` | `features/fasilitator/hooks/useChildAssessment.ts` | Child assessment logic |
| `useLiveMonitor` | `features/admin/hooks/useLiveMonitor.ts` | Live session monitoring |
| `useConsentMonitor` | `features/admin/hooks/useConsentMonitor.ts` | Consent monitoring |
| `useMissionBank` | `features/admin/hooks/useMissionBank.ts` | Mission bank CRUD |
| `useReportReview` | `features/admin/hooks/useReportReview.ts` | Report review |
| `useReportSession` | `features/admin/hooks/useReportSession.ts` | Session reports |
| `useFrameUploadQueue` | `features/admin/hooks/useFrameUploadQueue.ts` | Frame upload queue |
| `useRateLimit` | `features/auth/hooks/useRateLimit.ts` | Login rate limiting |

### State Management

- **Zustand** — `core/stores/authStore.ts` (auth) and `core/stores/tenantStore.ts` (active tenant).
- **TanStack React Query** — installed but **not wired** (no `QueryClientProvider`). All pages use `useState` + `useEffect` with services directly. Don't use `useQuery`/`useMutation` without wiring the provider first.
- **react-hook-form** + **zod** — forms (Login, Register, and various admin forms).

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

## Backend API Routes

All routes are under `/api`. Route registration is in `handler/router_*.go` files.

### Auth (`/api/auth`)

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| POST | `/login` | `AuthHandler.Login` | Public |
| POST | `/register` | `AuthHandler.Register` | Public |
| POST | `/refresh` | `AuthHandler.Refresh` | Public |
| GET | `/me` | `AuthHandler.Me` | JWT |
| POST | `/logout` | `AuthHandler.Logout` | JWT |
| POST | `/kiosk` | `AuthHandler.IssueKiosk` | JWT + TenantScope |

### Tenants (`/api/tenants`) — SUPER_ADMIN only

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `TenantHandler.List` |
| POST | `/` | `TenantHandler.Create` |
| GET | `/stats` | `TenantHandler.Stats` |
| GET | `/:id` | `TenantHandler.Get` |
| PUT | `/:id` | `TenantHandler.Update` |
| DELETE | `/:id` | `TenantHandler.Delete` |

### Users (`/api/users`)

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| GET | `/` | `UserHandler.List` | JWT + SUPER_ADMIN/ADMIN |
| POST | `/` | `UserHandler.Create` | JWT + SUPER_ADMIN/ADMIN |
| GET | `/:id` | `UserHandler.Get` | JWT + SUPER_ADMIN/ADMIN |
| PUT | `/:id` | `UserHandler.Update` | JWT + SUPER_ADMIN/ADMIN |
| DELETE | `/:id` | `UserHandler.Delete` | JWT + SUPER_ADMIN |
| POST | `/:id/approve` | `UserHandler.Approve` | JWT + SUPER_ADMIN |
| POST | `/:id/reject` | `UserHandler.Reject` | JWT + SUPER_ADMIN |
| POST | `/:id/deactivate` | `UserHandler.Deactivate` | JWT + SUPER_ADMIN |

### Programs (`/api/programs`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `ProgramHandler.List` |
| POST | `/` | `ProgramHandler.Create` |
| GET | `/:id` | `ProgramHandler.Get` |
| PUT | `/:id` | `ProgramHandler.Update` |
| POST | `/:id/toggle-active` | `ProgramHandler.ToggleActive` |
| DELETE | `/:id` | `ProgramHandler.Delete` |
| GET | `/:id/stages` | `ProgramHandler.ListStages` |
| POST | `/:id/stages` | `ProgramHandler.CreateStage` |
| PUT | `/:id/stages/:stageId` | `ProgramHandler.UpdateStage` |
| DELETE | `/:id/stages/:stageId` | `ProgramHandler.DeleteStage` |
| POST | `/:id/stages/reorder` | `ProgramHandler.ReorderStages` |
| GET | `/program-stages/:stageId/contents` | `ProgramHandler.ListContents` |
| POST | `/program-stages/:stageId/contents` | `ProgramHandler.CreateContent` |
| PUT | `/program-stages/:stageId/contents/:contentId` | `ProgramHandler.UpdateContent` |
| DELETE | `/program-stages/:stageId/contents/:contentId` | `ProgramHandler.DeleteContent` |
| POST | `/program-stages/:stageId/contents/reorder` | `ProgramHandler.ReorderContents` |

### Sessions (`/api/sessions`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `SessionHandler.List` |
| POST | `/` | `SessionHandler.Create` |
| GET | `/:id` | `SessionHandler.Get` |
| PUT | `/:id` | `SessionHandler.Update` |
| DELETE | `/:id` | `SessionHandler.Delete` |
| POST | `/:id/start` | `SessionHandler.Start` |
| POST | `/:id/complete` | `SessionHandler.Complete` |
| POST | `/:id/cancel` | `SessionHandler.Cancel` |
| GET | `/:id/stages` | `SessionHandler.GetStages` |
| POST | `/:id/stages/:stageId/assign` | `SessionHandler.AssignStage` |
| POST | `/:id/facilitator` | `SessionHandler.AssignFacilitator` |
| GET | `/:sessionId/groups` | `SessionHandler.Groups` |
| POST | `/:sessionId/groups` | `SessionHandler.CreateGroup` |
| PUT | `/:sessionId/groups/:groupId` | `SessionHandler.UpdateGroup` |

### Participants (`/api/participants`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `ParticipantHandler.List` |
| POST | `/` | `ParticipantHandler.Create` |
| GET | `/:id` | `ParticipantHandler.Get` |
| PUT | `/:id` | `ParticipantHandler.Update` |
| DELETE | `/:id` | `ParticipantHandler.Delete` |
| POST | `/:id/toggle` | `ParticipantHandler.Toggle` |

### Assessments (`/api/assessments`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `AssessmentHandler.List` |
| POST | `/` | `AssessmentHandler.Upsert` |
| DELETE | `/:id` | `AssessmentHandler.Delete` |

### Reports (`/api/reports`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `ReportHandler.List` |
| GET | `/:id` | `ReportHandler.Get` |
| POST | `/generate` | `ReportHandler.Generate` |
| POST | `/:id/approve` | `ReportHandler.Approve` |
| POST | `/:id/send` | `ReportHandler.Send` |

### Mission Banks (`/api/mission-banks`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `MissionBankHandler.List` |
| POST | `/` | `MissionBankHandler.Create` |
| PUT | `/:id` | `MissionBankHandler.Update` |
| DELETE | `/:id` | `MissionBankHandler.Delete` |

### Participant Missions (`/api/participant-missions`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `ParticipantMissionHandler.List` |
| POST | `/replace` | `ParticipantMissionHandler.Replace` |
| POST | `/:id/toggle` | `ParticipantMissionHandler.Toggle` |
| DELETE | `/:id` | `ParticipantMissionHandler.Delete` |

### Frames (`/api/frames`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `FrameHandler.List` |
| POST | `/` | `FrameHandler.Create` |
| PUT | `/:id` | `FrameHandler.Update` |
| DELETE | `/:id` | `FrameHandler.Delete` |

### Photos (`/api/photos`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `PhotoHandler.List` |
| POST | `/` | `PhotoHandler.Create` |
| PUT | `/:id` | `PhotoHandler.Update` |
| DELETE | `/:id` | `PhotoHandler.Delete` |

### Recordings (`/api/recordings`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `RecordingHandler.List` |
| POST | `/` | `RecordingHandler.Create` |
| POST | `/:id/review` | `RecordingHandler.Review` |

### Consent (`/api/consent`)

| Method | Path | Handler |
|--------|------|---------|
| POST | `/` | `ConsentHandler.Create` |
| POST | `/respond` | `ConsentHandler.Respond` |
| GET | `/info` | `ConsentHandler.Info` |
| GET | `/summary` | `ConsentHandler.Summary` |

### Live (`/api/live`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/:sessionId/stream` | `LiveHandler.Stream` (SSE) |
| GET | `/:sessionId/groups` | `LiveHandler.Groups` |
| GET | `/:sessionId/timeline` | `LiveHandler.Timeline` |
| POST | `/:sessionId/override` | `LiveHandler.Override` |
| POST | `/:sessionId/jump` | `LiveHandler.Jump` |
| POST | `/:sessionId/reset` | `LiveHandler.Reset` |
| GET | `/:sessionId/notifications` | `LiveHandler.Notifications` |
| POST | `/:sessionId/notifications/mark-read` | `LiveHandler.MarkRead` |
| POST | `/:sessionId/notifications/mark-all-read` | `LiveHandler.MarkAllRead` |
| POST | `/:sessionId/notifications/:notifId/dismiss` | `LiveHandler.DismissApproval` |

### Notifications (`/api/notifications`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | `NotificationHandler.List` |
| POST | `/:id/read` | `NotificationHandler.MarkRead` |

### Media (`/api/media`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/*` | `MediaHandler.Get` (serves uploaded files) |

### Upload (`/api/upload`)

| Method | Path | Handler |
|--------|------|---------|
| POST | `/photo` | `UploadHandler.UploadPhoto` |
| POST | `/recording` | `UploadHandler.UploadRecording` |
| POST | `/frame` | `UploadHandler.UploadFrame` |
| POST | `/content` | `UploadHandler.UploadContent` |
| POST | `/avatar` | `UploadHandler.UploadAvatar` |

### Kiosk Media (`/api/kiosk/media`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/*` | `MediaHandler.Get` (public, for kiosk devices) |

## Backend Infrastructure

### AI Integration

**File:** `internal/infrastructure/ai/`

- `OpenRouterClient` — HTTP client for OpenRouter API (chat completions)
- `NarrativeGenerator` — Generates AI narratives for reports using system prompts
- Config: `OpenRouterAPIKey`, `OpenRouterModel`, `OpenRouterBaseURL`, `OpenRouterMaxTokens`

### Auth

**File:** `internal/infrastructure/auth/`

- `jwt.go` — JWT token generation and parsing (`golang-jwt/jwt/v5`)
- `hash.go` — SHA-256 token hashing (for refresh tokens)
- `revoker.go` — Token revocation with in-memory store + periodic purge
- `kiosk_store.go` — Kiosk session token storage
- `usecase.go` — Auth business logic (Login, Register, Refresh, Logout)

### Middleware Stack

**File:** `internal/delivery/http/middleware/`

| Middleware | Purpose |
|------------|---------|
| `JWTAuth` | Validates JWT Bearer token, sets user context |
| `RequireRole(roles...)` | Role-based access control |
| `TenantScope` | Enforces tenant isolation via `X-Tenant-Id` header |
| `ErrorHandler` | Global error handler with custom error types |
| `CORS` | Cross-origin resource sharing |
| `Recover` | Panic recovery |
| `SecurityHeaders` | Security headers (X-Content-Type-Options, etc.) |
| `RateLimit` | Token bucket rate limiting |
| `Validate` | Request validation (go-playground/validator) |

### Error Handling Pattern

**File:** `internal/pkg/errors/`

- `Internal(msg)` — 500 Internal Server Error (most used, fan-in: 101)
- `NotFound(msg)` — 404 Not Found
- `BadRequest(msg)` — 400 Bad Request
- `Unauthorized(msg)` — 401 Unauthorized
- `Forbidden(msg)` — 403 Forbidden

**File:** `internal/pkg/response/`

- `OK(c, data)` — 200 success response (fan-in: 51)
- `Fail(c, err)` — Error response with appropriate status code
- `Created(c, data)` — 201 created response
- `Paginated(c, data, total, page, limit)` — Paginated response

### GORM Models

**File:** `internal/infrastructure/persistence/`

| Model | File | Table |
|-------|------|-------|
| `AssessmentModel` | `assessment_model.go` | `assessments` |
| `SmartPhotoModel` | `content_model.go` | `smart_photos` |
| `RecordingModel` | `content_model.go` | `recordings` |
| `PhotoFrameModel` | `frame_model.go` | `photo_frames` |
| `TimelineEventModel` | `live_model.go` | `timeline_events` |
| `MissionBankModel` | `missionbank_model.go` | `mission_banks` |
| `ParticipantMissionModel` | `participantmission_model.go` | `participant_missions` |
| `ProgramModel` | `program_model.go` | `programs` |
| `ProgramStageModel` | `program_model.go` | `program_stages` |
| `StageContentModel` | `program_model.go` | `stage_contents` |
| `ReportModel` | `report_model.go` | `reports` |
| `SessionModel` | `session_model.go` | `sessions` |
| `SessionStageModel` | `session_model.go` | `session_stages` |
| `SessionGroupModel` | `session_model.go` | `session_groups` |
| `GroupStageProgressModel` | `session_model.go` | `group_stage_progress` |
| `ParticipantModel` | `session_model.go` | `participants` |
| `TenantModel` | `tenant_model.go` | `tenants` |
| `UserModel` | `user_model.go` | `users` |
| `RefreshTokenModel` | `refresh_repo.go` | `refresh_tokens` |
| `NotificationModel` | `notification_repo.go` | `notifications` |
| `KioskStore` | `auth/kiosk_store.go` | `kiosk_sessions` |

### Repository Implementations

**File:** `internal/infrastructure/persistence/`

| Repository | File | Interface |
|------------|------|-----------|
| `GormAssessmentRepository` | `assessment_repo.go` | `AssessmentRepository` |
| `GormPhotoRepository` | `content_repo.go` | `PhotoRepository` |
| `GormRecordingRepository` | `content_repo.go` | `RecordingRepository` |
| `GormConsentRepository` | `content_repo.go` | `ConsentRepository` |
| `GormFrameRepository` | `frame_repo.go` | `FrameRepository` |
| `GormLiveRepository` | `live_repo.go` | `LiveRepository` |
| `GormNotificationRepository` | `notification_repo.go` | `NotificationRepository` |
| `GormProgramRepository` | `program_repo.go` | `ProgramRepository` |
| `GormRefreshRepository` | `refresh_repo.go` | `RefreshRepository` |
| `GormReportRepository` | `report_repo.go` | `ReportRepository` |
| `GormSessionRepository` | `session_repo.go` | `SessionRepository` |
| `GormTenantRepository` | `tenant_repo.go` | `TenantRepository` |
| `GormUserRepository` | `user_repo.go` | `UserRepository` |
| `GormMissionBankRepository` | `missionbank_repo.go` | `MissionBankRepository` |
| `GormParticipantMissionRepository` | `participantmission_repo.go` | `ParticipantMissionRepository` |

### Migrations

**File:** `backend/migrations/` (golang-migrate format)

| Migration | Purpose |
|-----------|---------|
| `000001_init_schema` | Initial schema creation |
| `000002_normalize_types` | Normalize column types |
| `000003_normalize_1nf` | First normal form |
| `000004_normalize_bcnf` | BCNF normalization |
| `000005_normalize_fk` | Foreign key constraints |
| `000006_normalize_bonus` | Bonus normalization |
| `000007_normalize_3nf_cleanup` | 3NF cleanup |
| `000008_group_facilitator` | Group + facilitator tables |
| `000009_refresh_tokens_index_cleanup` | Refresh token index cleanup |
| `000010_session_time_fields` | Session time fields |
| `000011_consent_combined_token` | Combined consent token |
| `000012_drop_consent_token_unique` | Drop consent token unique constraint |

## Testing & QA

**⚠️ CRITICAL: The project has ZERO test files.**

- **Backend:** No `*_test.go` files exist anywhere. CI runs `go test ./...` but it passes vacuously (0 tests).
- **Frontend:** No `*.test.*` or `*.spec.*` files. No test framework installed (no vitest, jest, testing-library).
- **No linting tools:** No ESLint, Prettier, or pre-commit hooks configured.
- **No Makefile** — build orchestration is via `pnpm` scripts and CI workflow.

### Test Infrastructure (defined but unused)

Backend `.env.example` defines test DB config:
```
TEST_DB_HOST=127.0.0.1
TEST_DB_PORT=3306
TEST_DB_USER=root
TEST_DB_PASSWORD=admin
TEST_DB_NAME=kidversa_test
```

CI spins `mariadb:12` service container with `MARIADB_DATABASE=kidversa_test`.

## Conventions

- UI text: **Bahasa Indonesia**.
- Feature modules: `features/<role>/pages/`, `features/<role>/components/`, `features/<role>/hooks/`.
- Entity types: `core/types/entities.ts`; enums: `core/types/enums.ts`; constants: `core/constants/app.ts`.
- Navigation paths live in `core/constants/app.ts` → `ROUTES` (nested `AUTH`/`ADMIN`/`FASILITATOR`/`PARENT`). Always use `ROUTES.*`. `ROUTES.AUTH` is an object — use `ROUTES.AUTH.BASE`/`.LOGIN`/`.REGISTER`, never treat it as a string.
- API routes live in `core/constants/apiRoutes.ts`.
- Parameterized path builders also exported from `app.ts`: `programListPath()`, `programDetailPath(id)`, `programStagePath(programId, stageId)`, `contentNewPath({programId, stageId})`, `contentEditPath(contentId, {programId, stageId})`, `kioskAccessPath()`, `kioskSessionPath()`. Prefer these over hardcoded strings.
- New pages: add to the matching `app/routes/<segment>.tsx` as a `React.lazy()` import, consumed by `guardedRoute` or `lazyRoute`.

## Runtime/Tooling Preferences

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20.x (CI pinned) | No `.nvmrc` or `engines` field |
| pnpm | latest (corepack) | Package manager |
| Go | 1.26.4 | `go.mod` version |
| MariaDB | 12 | Database |
| Vite | 8.x | Build tool |
| TypeScript | 6.0.x (tilde = patch-only) | Strict mode enabled |
| Tailwind CSS | 4.x | No `tailwind.config.js` — uses `@theme` in CSS |

### Key Dependencies

**Frontend (production):**
- `react` ^19.2.7, `react-router-dom` ^7.18.1
- `zustand` ^5.0.14 (state), `@tanstack/react-query` ^5.101.2 (not wired)
- `react-hook-form` ^7.81.0 + `zod` ^4.4.3 (forms)
- `lucide-react` ^1.23.0 (icons), `recharts` ^3.9.2 (charts)
- `jspdf` ^4.2.1 + `html-to-image` 1.11.12 (PDF/image export)
- `@dnd-kit/core` ^6.3.1 + `@dnd-kit/sortable` ^10.0.0 (drag-and-drop)
- `idb` ^7.1.1 (**installed but IDB layer removed** — dead dependency)

**Backend (direct):**
- `labstack/echo/v5` v5.2.1, `gorm.io/gorm` v1.31.2
- `golang-jwt/jwt/v5` v5.3.1, `golang-migrate/migrate/v4` v4.19.1
- `go-playground/validator/v10` v10.30.3
- `google/uuid` v1.6.0, `joho/godotenv` v1.5.1
- `golang.org/x/crypto` v0.54.0

## Important Files

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/main.tsx` | React entry point |
| `frontend/src/App.tsx` | Root: splash screen + `backendClient.healthCheck()` + `authStore.checkSession()` |
| `frontend/src/app/router.tsx` | Route assembler — imports `app/routes/*` |
| `frontend/src/app/routes/helpers.tsx` | `guardedRoute`, `lazyRoute`, `SuspenseWrapper` |
| `frontend/src/app/routes/<segment>.tsx` | Per-feature route definitions |
| `frontend/src/core/stores/authStore.ts` | Zustand auth state |
| `frontend/src/core/stores/tenantStore.ts` | Zustand active-tenant state (`kidversa_active_tenant_id`) |
| `frontend/src/core/services/backendClient.ts` | API client: `apiRequest`, `getTokens`/`setTokens`, `ApiError`, `openSSE`, `startConnectionWatcher` |
| `frontend/src/core/services/apiEnvelope.ts` | `listRequest`/`itemRequest`/`mutateRequest`/`arrayRequest`/`voidRequest`/`nullableItemRequest` |
| `frontend/src/core/services/types.ts` | Service interfaces |
| `frontend/src/core/services/<domain>.ts` | Real API service impls |
| `frontend/src/core/services/live.ts` | Live SSE service (`useLiveSession`) |
| `frontend/src/core/constants/app.ts` | `ROUTES`, `COLORS`, path builders |
| `frontend/src/core/constants/apiRoutes.ts` | API route constants |
| `frontend/src/core/types/entities.ts` | Entity/DTO types |
| `frontend/src/core/types/enums.ts` | All enums incl. `UserRole` |
| `frontend/src/core/types/api.ts` | API types (`PaginatedResponse`, `ListParams`, DTOs) |
| `frontend/src/core/utils/cn.ts` | `cn()` = clsx + tailwind-merge |
| `frontend/src/index.css` | Tailwind v4 theme + M3 tokens + animations |
| `frontend/index.html` | HTML entry point — loads Inter font, mounts React app |
| `frontend/vite.config.ts` | Vite + PWA + `/api` proxy |
| `frontend/pnpm-lock.yaml` | Lockfile |

### Backend

| File | Purpose |
|------|---------|
| `backend/cmd/server/main.go` | API server entry point |
| `backend/cmd/migrate/main.go` | Migration runner + bootstrap/seeding |
| `backend/internal/config/config.go` | Config loading (40+ fields) |
| `backend/internal/delivery/http/handler/router_*.go` | Route registration per domain |
| `backend/internal/delivery/http/middleware/*.go` | Middleware stack |
| `backend/internal/domain/entity/*.go` | Domain entities |
| `backend/internal/domain/repository/*.go` | Repository interfaces |
| `backend/internal/infrastructure/persistence/*_model.go` | GORM models |
| `backend/internal/infrastructure/persistence/*_repo.go` | Repository implementations |
| `backend/internal/infrastructure/ai/narrative_generator.go` | AI narrative generation |
| `backend/internal/infrastructure/auth/jwt.go` | JWT token handling |
| `backend/internal/pkg/errors/errors.go` | App error types |
| `backend/internal/pkg/response/response.go` | JSON response helpers |
| `backend/internal/pkg/sse/hub.go` | SSE hub for real-time streaming |
| `backend/migrations/*.sql` | Database migrations |
| `backend/go.mod` | Go module definition |
| `backend/.env.example` | Template for all env vars |
| `backend/docker-compose.yml` | Docker Compose for local dev |
| `backend/Dockerfile` | Multi-stage Docker build |
| `backend/.github/workflows/ci.yml` | CI pipeline |

## Environment Setup

### Development (Windows 10 + Docker Desktop)

#### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Docker Desktop | latest | Container runtime |
| Node.js | 20.x | Frontend build |
| pnpm | latest (corepack) | Package manager |
| Go | 1.26+ | Backend build |
| Git | latest | Version control |

#### Step 1: Install MariaDB via Docker

```bash
# Run MariaDB 12 container (persists across restarts)
docker run -d \
  --name mariadb-12 \
  -e MARIADB_ROOT_PASSWORD=admin \
  -e MARIADB_DATABASE=kidversa \
  -p 3306:3306 \
  --restart unless-stopped \
  mariadb:12

# Verify it's running
docker ps | grep mariadb-12
```

#### Step 2: Backend Setup

```bash
cd backend

# Create .env from template
cp .env.example .env

# Edit .env — critical fields:
#   DB_HOST=127.0.0.1
#   DB_PORT=3306
#   DB_USER=root
#   DB_PASSWORD=admin
#   DB_NAME=kidversa
#   JWT_SECRET=<generate: openssl rand -hex 32>
#   CORS_ORIGINS=http://localhost:5173
#   COOKIE_SECURE=false
#   COOKIE_SAMESITE=Lax

# Run migrations + bootstrap (creates superadmin, default tenants)
go run ./cmd/migrate

# Start backend server
go run ./cmd/server
# → http://localhost:8080
```

#### Step 3: Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Start dev server
pnpm dev
# → http://localhost:5173
# Vite proxies /api → http://localhost:8080
```

#### Step 4: Docker Compose (Alternative)

```bash
cd backend

# Build and run backend container
# (uses host.docker.internal to reach MariaDB on host)
docker compose up --build

# The backend container:
# - Builds Go binary from Dockerfile
# - Runs migrations on startup
# - Serves API on port 8080
# - Uploads persisted via volume mount
```

#### Default Accounts (after migration)

| Email | Password | Role |
|-------|----------|------|
| `superadmin@kidversa.id` | `password123` | SUPER_ADMIN |
| `admin.bandung@kidversa.id` | `password123` | ADMIN |

Default tenants: `tenant-bandung`, `tenant-subang`

#### Development Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    Windows 10 Host                          │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Frontend   │    │   Backend    │    │   MariaDB    │  │
│  │   (Node.js)  │    │   (Go)       │    │   (Docker)   │  │
│  │   :5173      │───▶│   :8080      │───▶│   :3306      │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│        │                   │                   │            │
│        │   /api proxy      │    DB_HOST=       │            │
│        └───────────────────┘    127.0.0.1      │            │
│                                               │            │
│                              ┌────────────────┘            │
│                              │  docker network             │
│                              │  (host.docker.internal)     │
│                              └─────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

### Production (VPS Ubuntu + Docker)

#### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Ubuntu | 22.04+ | Server OS |
| Docker | 24.x+ | Container runtime |
| Docker Compose | v2.x | Multi-container orchestration |
| Nginx | 1.24+ | Reverse proxy + static files |

#### Step 1: Install Docker on Ubuntu

```bash
# Update package index
sudo apt-get update

# Install Docker
sudo apt-get install -y docker.io docker-compose-plugin

# Start Docker
sudo systemctl enable docker
sudo systemctl start docker

# Add current user to docker group (logout/login required)
sudo usermod -aG docker $USER
```

#### Step 2: Clone Repository

```bash
cd /opt
sudo git clone https://github.com/your-org/kidversa-edutourism.git
sudo chown -R $USER:$USER kidversa-edutourism
cd kidversa-edutourism
```

#### Step 3: Create Production Docker Compose

Create `docker-compose.prod.yml` at project root:

```yaml
version: '3.8'

services:
  # MariaDB Database
  mariadb:
    image: mariadb:12
    container_name: kidversa-db
    environment:
      MARIADB_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MARIADB_DATABASE: ${DB_NAME}
      MARIADB_USER: ${DB_USER}
      MARIADB_PASSWORD: ${DB_PASSWORD}
    volumes:
      - mariadb_data:/var/lib/mysql
    ports:
      - "127.0.0.1:3306:3306"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 10

  # Backend API
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: kidversa-api
    environment:
      # Database
      DB_HOST: mariadb
      DB_PORT: "3306"
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_NAME}
      DB_MAX_OPEN: "25"
      DB_MAX_IDLE: "10"
      DB_CONN_MAX_LIFETIME: "1h"
      
      # JWT (MUST be >= 32 bytes)
      JWT_SECRET: ${JWT_SECRET}
      JWT_ACCESS_TTL: "15m"
      JWT_REFRESH_TTL: "168h"
      
      # Server
      SERVER_PORT: "8080"
      CORS_ORIGINS: ${CORS_ORIGINS}
      
      # Cookie (production: HTTPS)
      COOKIE_SECURE: "true"
      COOKIE_SAMESITE: "None"
      
      # Rate limiting
      RATE_LIMIT_PER_MIN: "60"
      
      # Upload
      UPLOAD_DIR: /app/uploads
      
      # AI (optional)
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
    volumes:
      - uploads_data:/app/uploads
    depends_on:
      mariadb:
        condition: service_healthy
    restart: unless-stopped
    stop_grace_period: 30s

  # Frontend (Nginx serving static files)
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: kidversa-web
    depends_on:
      - backend
    restart: unless-stopped

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: kidversa-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - frontend
      - backend
    restart: unless-stopped

volumes:
  mariadb_data:
    driver: local
  uploads_data:
    driver: local
```

#### Step 4: Create Frontend Dockerfile

Create `frontend/Dockerfile`:

```dockerfile
# Build stage
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

#### Step 5: Create Frontend Nginx Config

Create `frontend/nginx.conf`:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://backend:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE support
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
    }

    # Media files
    location /media/ {
        proxy_pass http://backend:8080/api/media/;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Step 6: Create Root Nginx Config

Create `nginx.conf` at project root:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend
    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api/ {
        proxy_pass http://backend:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE support
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        
        # File upload limit
        client_max_body_size 25M;
    }

    # Health check
    location /health {
        proxy_pass http://backend:8080/health;
    }
}
```

#### Step 7: Create Production .env

Create `.env` at project root:

```bash
# Database
DB_ROOT_PASSWORD=<generate: openssl rand -hex 16>
DB_USER=kidversa
DB_PASSWORD=<generate: openssl rand -hex 16>
DB_NAME=kidversa

# JWT (MUST be >= 32 bytes)
JWT_SECRET=<generate: openssl rand -hex 32>

# CORS (your domain)
CORS_ORIGINS=https://your-domain.com

# AI (optional)
OPENROUTER_API_KEY=sk-or-v1-your-key
```

#### Step 8: Deploy

```bash
cd /opt/kidversa-edutourism

# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Run migrations (first time only)
docker exec kidversa-api /app/migrate

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

#### Step 9: SSL Certificate (Let's Encrypt)

```bash
# Install certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy to project
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/

# Restart nginx
docker restart kidversa-proxy

# Auto-renewal (cron job)
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet && docker restart kidversa-proxy
```

#### Production Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VPS Ubuntu 22.04+                            │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Docker Network                           │  │
│  │                                                               │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐              │  │
│  │  │  Nginx   │    │ Frontend │    │ Backend  │              │  │
│  │  │  :443    │───▶│  (static │───▶│  :8080   │              │  │
│  │  │  (SSL)   │    │   files) │    │  (Go)    │              │  │
│  │  └──────────┘    └──────────┘    └────┬─────┘              │  │
│  │       │                               │                     │  │
│  │       │         ┌─────────────────────┘                     │  │
│  │       │         ▼                                           │  │
│  │       │    ┌──────────┐                                     │  │
│  │       │    │ MariaDB  │                                     │  │
│  │       │    │  :3306   │                                     │  │
│  │       │    └──────────┘                                     │  │
│  │       │         │                                           │  │
│  │       │    ┌────┴─────┐                                     │  │
│  │       │    │  Volume  │                                     │  │
│  │       │    │ (data)   │                                     │  │
│  │       │    └──────────┘                                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Persistent Volumes                        │  │
│  │  • mariadb_data: /var/lib/mysql (database)                   │  │
│  │  • uploads_data: /app/uploads (photos, recordings, frames)   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

#### Environment Differences

| Setting | Development | Production |
|---------|-------------|------------|
| `DB_HOST` | `127.0.0.1` | `mariadb` (Docker service name) |
| `CORS_ORIGINS` | `http://localhost:5173` | `https://your-domain.com` |
| `COOKIE_SECURE` | `false` | `true` |
| `COOKIE_SAMESITE` | `Lax` | `None` |
| Frontend serving | Vite dev server (`:5173`) | Nginx static files |
| SSL/TLS | None | Let's Encrypt |
| Upload storage | Local `./uploads/` | Docker volume |
| Logs | stdout/stdout | Docker logs + optional ELK |

#### Useful Production Commands

```bash
# Rebuild after code changes
docker compose -f docker-compose.prod.yml up -d --build

# View backend logs
docker logs kidversa-api -f

# Enter backend container
docker exec -it kidversa-api sh

# Run database migration
docker exec kidversa-api /app/migrate

# Backup database
docker exec kidversa-db mysqldump -u root -p<password> kidversa > backup.sql

# Restore database
docker exec -i kidversa-db mysql -u root -p<password> kidversa < backup.sql

# Check disk usage
docker system df

# Clean up unused images
docker image prune -a
```

## Gotchas

- Frontend has **no `.env`** — `VITE_API_BASE_URL` is hardcoded to `http://localhost:8080` in `core/services/backendClient.ts`. The backend **does** use `backend/.env` (gitignored) — `backend/.env.example` documents every var.
- Gitignored (root `.gitignore`): `node_modules/`, `vendor/`, `dist/`, `*.exe`, `*.db/*.sqlite*`, `.env`, `CLAUDE.md`, `.claude/`, `.codegraph/`, `.kilo/`, `.serena/`, `.hermes/`, `.docs/`, `.img/`, `.plans/`, `docs/`, `img/`. (`docs/` and `img/` are tracked, not ignored.)
- `noUnusedLocals`/`noUnusedParameters` are enabled — every unused import breaks the build.
- TanStack React Query installed but no `QueryClientProvider` — don't use `useQuery` hooks yet.
- `idb` package is installed but the IndexedDB layer was fully removed — it's a dead dependency.
- **No root `package.json`** — this is NOT a pnpm workspace monorepo at the root level. `frontend/` is the sole JS package.
- Backend module name in `go.mod` is `kidversa-edutourism-backend` (not `kidversa-edutourism`).
- `html-to-image` is pinned to exact version `1.11.12` (no caret).
- TypeScript is pinned with tilde `~6.0.3` (patch-only updates).
- FontAwesome is pinned to exact version `6.4.0` (no caret).

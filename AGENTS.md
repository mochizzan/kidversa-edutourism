# AGENTS.md — Kidversa Edutourism

## Overview

Two independent apps in a single repo — no shared build system or monorepo tooling.

- **`frontend/`** — React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 4 + PWA
- **`backend/`** — Go 1.26 + Echo v4 + GORM + SQLite

Backend is early-stage (single `main.go`, simple CRUD). Frontend is significantly ahead — feature-based architecture with mock services. The frontend is **not connected to the real backend yet**.

## Kilo Code CLI: Agent Modes & Rules

### General Rules
- Every mode has its own responsibilities and permissions.
- Never perform actions outside the active mode.
- Never bypass mode restrictions using alternative commands (EOF, tee, echo, printf, sed, python, node, shell redirection, etc.).
- If a task belongs to another mode, explain it and ask the user to switch modes.

### 1. Ask Mode
**Role:** Understand the user's request through discussion and analysis.

**Behavior**
- Conduct in-depth interviews until the user's goals are fully understood.
- Think critically and avoid static or template-based responses.
- Focus on understanding rather than solving immediately.

**Allowed**
- Read files, search files, analyze, explain, and provide recommendations.

**Forbidden**
- Create, edit, delete, or modify any project files.

---

### 2. Plan Mode
**Role:** Create an implementation plan.

**Behavior**
- Verify the user's intent before generating a plan.
- Do not create a plan while still gathering requirements.

**Allowed**
- Read, analyze, and create a plan after user confirmation.

**Rules**
- Save plans in `plans/`
- Filename: `YYYY-MM-DD-plan-name.md`
- Include `Status: PLANNED`

**Forbidden**
- Implement or modify source code.

---

### 3. Code Mode
**Role:** Implement approved work.

**Behavior**
- Understand whether the implementation comes from an approved plan or a direct user request.
- Validate the implementation before completing the task.

**Allowed**
- Create, edit, refactor, and remove code within the approved scope.

**Rules**
- If implementing from a plan, update it to `Status: EXECUTED`.

**Forbidden**
- Modify unrelated files or implement features outside the approved scope.

---

### 4. Debug Mode
**Role:** Investigate and identify root causes.

**Behavior**
- Investigate before fixing.
- Recommend logging or diagnostic steps when needed.
- Base conclusions on evidence, not assumptions.

**Allowed**
- Read, analyze, inspect logs, and recommend fixes.

**Forbidden**
- Modify source code unless the user explicitly switches to Code Mode.

## Commands

### Frontend (`frontend/`)

```bash
pnpm install        # install deps
pnpm dev            # Vite dev server on :5173, proxies /api → :8080
pnpm build          # tsc -b && vite build
pnpm preview        # preview production build

```

There are **no lint, format, or test scripts** configured. `pnpm build` is the only verification step available.

### Backend (`backend/`)

```bash
go mod tidy
go run .            # starts on :8080 (set PORT env to override)

```

Binary output: `kidversa-server` (gitignored). Database: `kidversa.db` (gitignored, auto-created).

## Architecture

### Frontend source layout

```
src/
├── app/            # Router (react-router-dom) + providers
├── core/           # Types, services, stores, hooks, utils, constants
├── features/       # Feature modules: admin, auth, fasilitator, parent
├── pages/          # Top-level pages (LandingPage, NotFoundPage)
└── shared/         # Layouts, UI components, constants, utils

```

### Service layer pattern

`core/services/types.ts` defines service interfaces (e.g. `ProgramService`, `SessionService`). `core/services/mock/` provides localStorage-backed implementations. `core/services/*.ts` re-exports the mock implementations. When real API integration is added, swap the re-export in `core/services/*.ts` — the rest of the app consumes the interface.

### Routing and roles

Role-based route protection via `shared/components/auth/ProtectedRoute.tsx`:

* `SUPER_ADMIN` / `ADMIN_WISATA` / `KOORDINATOR` → `/admin/*`
* `FASILITATOR` → `/fasilitator/*`
* `PARENT` → `/parent/*`

`/` redirects to `/auth/login`. All route pages are lazy-loaded.

### State management

* **Zustand** — `core/stores/authStore.ts` (currently the only store)
* **React Query** — in `package.json` but not yet wired up (no `QueryClientProvider` visible)

### Vite proxy

`vite.config.ts` proxies `/api` to `http://localhost:8080`. Frontend reads `VITE_API_BASE_URL` env var (defaults to `http://localhost:8080`).

## Conventions

* **Language**: UI text is in **Indonesian** (e.g. "Memuat...", role names, labels).
* **Brand colors**: Purple `#5B2C8D` primary, Amber `#F5A623` accent. Use Tailwind theme tokens (`bg-primary`, `text-accent`, etc.) — defined in `src/index.css` via `@theme` block (Tailwind v4 style, not `tailwind.config`).
* **Utility**: `cn()` from `core/utils` = `clsx` + `tailwind-merge`. Use it for conditional classes.
* **Component style**: Functional components, named exports for UI components (e.g. `Button`), default exports for pages/layouts.
* **Forms**: `react-hook-form` + `zod` validation + `@hookform/resolvers`.
* **IDs**: String-based UUIDs (e.g. `"u-1"`, `"t-1"`), not numeric.
* **No `.env` files committed** — `.env` is gitignored. Backend reads `PORT` env var.

## Gotchas

* `tsconfig.json` has `noUnusedLocals: true` and `noUnusedParameters: true` — unused imports/params will fail `pnpm build`.
* `pnpm build` runs `tsc -b` first, so type errors block the build.
* Tailwind CSS v4 uses `@import "tailwindcss"` and `@theme` in CSS — there is **no `tailwind.config.js**`.
* The `providers/` directory in `app/providers/` exists but is empty — QueryClientProvider and other providers should go there when added.
* The backend `main.go` has models (Story, Destination) that don't match the frontend's domain model (Programs, Sessions, Participants, etc.) — these are separate tracks.
* Mock auth uses localStorage with prefix `kidversa_mock_`. Mock accounts are in `core/config/mock-accounts.ts` (password: `password123`).

## Key reference docs

* `docs/Kidversa_FSD_v1.md` — Functional spec for all 18 modules (Indonesian). Authoritative source for business rules and data model.
* `docs/Kidversa_ERD_v1.md` — Database schema.
* `docs/Kidversa_BRD_v3.md` — Business requirements.
* `plans/` — Active design/implementation plans.
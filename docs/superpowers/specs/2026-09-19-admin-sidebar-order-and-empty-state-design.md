# Admin Sidebar Order & Empty-State Duplicate Button Fix — Design Spec

**Date:** 2026-09-19  
**Status:** Approved for Implementation  
**Author:** Brainstorming Session  

---

## Problem Statement

Two related UX issues on the admin dashboard:

### Issue 1 — Sidebar menu order is backwards within the PROGRAM section

The `/admin` sidebar is driven by `ADMIN_ROUTE_ACCESS` (in `frontend/src/core/utils/permissions.ts`)
and rendered by `buildMenuSections` inside `AdminLayout.tsx`. Three items — `programs`, `topics`,
`activities` — are grouped into a collapsible "Program" accordion (via the `PROGRAM_SUB_PATHS`
constant). However, the remaining PROGRAM items (`sessions`, `participants`, `reports`,
`missions`) are rendered as top-level items **above** the Program accordion.

**Current visual order (PROGRAM section):**

1. Sessions
2. Peserta (Participants)
3. Reports
4. Missions
5. **[Program]** → Daftar Program, Daftar Topik, Daftar Kegiatan *(accordion)*

This is the reverse of the logical workflow: `program → topik → kegiatan → sesi`. Users see "Sessions"
listed *before* "Daftar Program," breaking the natural progression.

### Issue 2 — Inconsistent empty-state handling causes duplicate "create" buttons

Every admin list page renders a primary "create" button in the `PageHeader` `actions` prop (or, on
detail pages, in a `Card` `actions` prop). However, the `EmptyState` component
(`frontend/src/shared/components/feedback/EmptyState.tsx`) *also* optionally accepts an `action`
prop that renders a second button. On pages where both are present, users see **two** copies of the
same "create" button when the data table is empty.

The behavior is inconsistent:
- `/admin/sessions`: PageHeader has "Buat Sesi" + EmptyState has action button "Buat Sesi" → **duplicate**
- `/admin/missions`: PageHeader has "Tambah Misi Baru" + EmptyState has action button only when a program
  is selected → **duplicate (conditional)**; when no program is selected, the EmptyState text says
  "klik 'Tambah Misi Baru'" but **no button is rendered** in the empty state, causing confusion
- `/admin/participants`: PageHeader has "Tambah Peserta" + EmptyState has **no action** → **no duplicate
  but inconsistent** (some pages have the button, some don't)

**10 pages** contain a duplicate `action` button on their `EmptyState` (listed below). The
`EmptyState` component is used by 56 callers in total; the `action` prop is only needed by
`SessionDetailPage` (where the action is a *navigation* button, "Ke Halaman Program", not a create
button).

---

## Goals

1. **Sidebar:** Render the collapsible "Program" accordion **before** the Sessions/Peserta/Reports/Missions
   top-level items, so the visual order matches the logical `program → topik → kegiatan → sesi` flow.
   Do **not** change the accordion grouping itself (per user: "tidak perlu dimasukkan ke akordion").
2. **EmptyState:** Eliminate duplicate "create" buttons. The "create" button lives **only** in the
   `PageHeader` (list pages) or `Card` actions (detail pages). The `EmptyState` shows icon + title +
   description only — no button.
3. **Enforce the pattern:** Prevent future regressions where an author adds a duplicate button inside
   an `EmptyState` on a list page.
4. **Text consistency:** EmptyState descriptions that reference a button should say "di atas" to
   indicate the button's location (PageHeader).

## Non-Goals

- NOT changing sidebar labels (mixed Indonesian/English labels like "Sessions" vs "Daftar Program"
  are out of scope — user said "hanya urutannya di sesuaikan saja").
- NOT removing the `action` prop from the `EmptyState` component itself — `SessionDetailPage` still
  uses it for its "Ke Halaman Program" navigation button.
- NOT modifying the `DataTable` component or its `emptyState` prop API.
- NOT changing any backend Go code or migrations.
- NOT touching non-duplicate `EmptyState` usages (e.g., `ConsentMonitorPage`, `LiveMonitorPage`).

---

## Current Architecture

### Sidebar rendering flow (`AdminLayout.tsx`)

```
AdminLayout
  ├─ ADMIN_ROUTE_ACCESS (permissions.ts) — source of truth for order + roles + section
  ├─ buildMenuSections(userRole) — groups by section, filters by role
  │   ├─ bySection Map<section, MenuItem[]>
  │   └─ returns [{ section: 'OVERVIEW', items: [...] }, { section: 'PROGRAM', items: [...] }, ...]
  │
  └─ Render (per section):
      OTHER ITEMS (not in PROGRAM_SUB_PATHS)
        → sessions, participants, reports, missions
      THEN Program accordion (PROGRAM_SUB_PATHS = ['programs','topics','activities'])
        → Daftar Program, Daftar Topik, Daftar Kegiatan
```

The bug: `otherItems.map(...)` is placed **before** the `programItems` accordion block in the JSX,
so sessions/participants/reports/missions visually precede the Program accordion.

### EmptyState component (`EmptyState.tsx`)

```tsx
interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }  // ← the source of duplication
  className?: string
}
```

### Pages with duplicate create buttons (10 total)

| # | Page | PageHeader / Card create button | EmptyState action button |
|---|------|---------------------------------|--------------------------|
| 1 | `SessionsPage` | "Buat Sesi" (PageHeader) | "Buat Sesi" |
| 2 | `ProgramsPage` | "Buat Program" (PageHeader) | "Buat Program" |
| 3 | `TopicsPage` | "Tambah Topik" (PageHeader) | "Tambah Topik" |
| 4 | `ActivitiesPage` | "Tambah Kegiatan" (PageHeader) | "Tambah Kegiatan" |
| 5 | `MissionBankPage` | "Tambah Misi Baru" (PageHeader) | "Tambah Misi Baru" (conditional) |
| 6 | `ParticipantsPage` | "Tambah Peserta" (PageHeader) | *(none — already correct)* |
| 7 | `ContentPage` | "Tambah Konten" (PageHeader) | "Tambah Konten" |
| 8 | `FramesPage` | "Upload Frame" (PageHeader) | "Upload Frame" |
| 9 | `ActivityDetailPage` | "Tambah Konten" (Card actions) | "Tambah Konten" |
| 10 | `TopicDetailPage` | "Tambah Kegiatan" (Card actions) | "Tambah Kegiatan" |

**Kept unchanged (no duplicate — action is navigational, not create):**
- `SessionDetailPage` — EmptyState action "Ke Halaman Program" (navigation to program list page)

---

## Proposed Design

### Design A: Sidebar Reorder

**File:** `frontend/src/shared/layouts/AdminLayout.tsx`

Swap the two render blocks inside the PROGRAM section's `<div className="flex flex-col gap-1">`:

```tsx
// BEFORE (current):
<div className="flex flex-col gap-1">
  {otherItems.map((item) => { /* Sessions, Peserta, Reports, Missions */ })}
  {isProgram && programItems.length > 0 && (<>
    {!isCollapsed && <button>Program</button>}
    {(isCollapsed || expanded) && programItems.map((item) => { /* Daftar Program, Topik, Kegiatan */ })}
  </>)}
</div>

// AFTER:
<div className="flex flex-col gap-1">
  {isProgram && programItems.length > 0 && (<>
    {!isCollapsed && <button>Program</button>}
    {(isCollapsed || expanded) && programItems.map((item) => { /* Daftar Program, Topik, Kegiatan */ })}
  </>)}
  {otherItems.map((item) => { /* Sessions, Peserta, Reports, Missions */ })}
</div>
```

**Resulting visual order (PROGRAM section):**

1. **[Program]** → Daftar Program, Daftar Topik, Daftar Kegiatan *(accordion)*
2. Sessions
3. Peserta
4. Reports
5. Missions

No changes to `buildMenuSections`, `SECTION_ORDER`, `PROGRAM_SUB_PATHS`, or `ADMIN_ROUTE_ACCESS` (the
array order already has the correct logical sequence: programs, topics, activities, sessions,
participants, reports, missions — only the *render* order within the JSX is wrong).

### Design B: Shared `ListEmptyState` Component

**New file:** `frontend/src/shared/components/feedback/ListEmptyState.tsx`

A thin wrapper around `EmptyState` that **omits the `action` prop at the TypeScript level**, making
it a compile-time error to add a button:

```tsx
import { EmptyState } from './EmptyState'
import type { EmptyStateProps } from './EmptyState'

/**
 * Empty-state for list pages where the "create" button lives in the PageHeader
 * (or Card actions), NOT inside the empty state.
 *
 * The `action` prop is intentionally omitted from the type so future authors
 * cannot accidentally add a duplicate create-button (compile-time guard).
 */
export function ListEmptyState(props: Omit<EmptyStateProps, 'action'>) {
  return <EmptyState {...props} />
}
```

- `EmptyState` component itself is **unchanged** — it still has its `action` prop for non-list
  consumers like `SessionDetailPage`.
- `DataTable`'s `emptyState` prop accepts `React.ReactNode`, so `<ListEmptyState .../>` can be
  passed directly — no `DataTable` API change needed.

### Design C: Page-by-Page Migration (EmptyState → ListEmptyState)

Replace `<EmptyState` with `<ListEmptyState` and remove the `action={{...}}` prop on **10 pages**.
Pages 1-8 are list pages using `DataTable`; pages 9-10 are detail pages using a `Card`.

| # | File | Change |
|---|------|--------|
| 1 | `features/admin/pages/SessionsPage.tsx` | Import `ListEmptyState`; replace `<EmptyState`; delete `action={{ label: 'Buat Sesi', ... }}` |
| 2 | `features/admin/pages/ProgramsPage.tsx` | Import `ListEmptyState`; replace `<EmptyState`; delete `action={{ label: 'Buat Program', ... }}` |
| 3 | `features/admin/pages/TopicsPage.tsx` | Import `ListEmptyState`; replace `<EmptyState`; delete `action={{ label: 'Tambah Topik', ... }}` |
| 4 | `features/admin/pages/ActivitiesPage.tsx` | Import `ListEmptyState`; replace `<EmptyState`; delete `action={{ label: 'Tambah Kegiatan', ... }}` |
| 5 | `features/admin/pages/MissionBankPage.tsx` | Import `ListEmptyState`; replace `<EmptyState`; delete `action={selectedProgram ? {...} : undefined}` |
| 6 | `features/admin/pages/ParticipantsPage.tsx` | Import `ListEmptyState`; replace `<EmptyState>` (no `action` to remove — already clean) |
| 7 | `features/admin/pages/ContentPage.tsx` | Import `ListEmptyState`; replace `<EmptyState`; delete `action={{ label: 'Tambah Konten', ... }}` |
| 8 | `features/admin/pages/FramesPage.tsx` | Import `ListEmptyState`; replace `<EmptyState`; delete `action={{ label: 'Upload Frame', ... }}` |
| 9 | `features/admin/pages/ActivityDetailPage.tsx` | Import `ListEmptyState`; replace `<EmptyState`; delete `action={{ label: 'Tambah Konten', ... }}` |
| 10 | `features/admin/pages/TopicDetailPage.tsx` | Import `ListEmptyState`; replace `<EmptyState`; delete `action={{ label: 'Tambah Kegiatan', ... }}` |

**NOT changed:**
- `SessionDetailPage.tsx` — continues using `EmptyState` with `action` = "Ke Halaman Program"
  (this is navigational, not a create button).

### Design D: EmptyState Description Text

Descriptions that reference the create button should append "di atas" so users look to the header.
Specific updates:

| Page | Current description | Updated description |
|------|---------------------|---------------------|
| `MissionBankPage` (no program) | "Pilih program atau klik 'Tambah Misi Baru' untuk membuat misi pertama." | "Pilih program, lalu klik 'Tambah Misi Baru' di atas untuk membuat misi pertama." |
| `MissionBankPage` (with program) | "Belum ada misi untuk program ini. Klik 'Tambah Misi Baru' untuk memulai." | "Belum ada misi untuk program ini. Klik 'Tambah Misi Baru' di atas untuk membuat misi pertama." |
| Other pages | Descriptions are already generic (e.g., "Buat sesi pertama untuk memulai.") — no change needed, the PageHeader button is visibly above | — |

---

## Testing Strategy

Since this project has no frontend test framework (per AGENTS.md — zero `test`/`spec` files, no
vitest/jest), verification is via visual smoke testing + build gate:

1. **Dev server smoke test** — launch `pnpm dev`, navigate to each affected `/admin/*` page:
   - `/admin/sessions` → EmptyState shows "Belum ada sesi" + text, **no button**; only "Buat Sesi"
     button in PageHeader. Sidebar order: Program accordion → Sessions → Peserta → Reports → Missions.
   - `/admin/missions` → "Belum ada misi" empty state with descriptive text, **no button**; only
     "Tambah Misi Baru" in PageHeader. Verify both no-program and with-program states.
   - `/admin/programs`, `/admin/topics`, `/admin/activities`, `/admin/participants`,
     `/admin/content`, `/admin/frames` → single create button in header, no button in empty state.
   - `/admin/sessions/new` (when no programs exist) → EmptyState still shows "Ke Halaman Program"
     button (navigation, not create).
   - `/admin/topics/:id` (tab "Kegiatan", no activities) → EmptyState shows description, no button;
     "Tambah Kegiatan" button is on the Card header.
   - `/admin/activities/:id` (no content) → EmptyState shows description, no button; "Tambah Konten"
     button is on the Card header.

2. **Build verification:** `pnpm build` (TypeScript `tsc -b` + Vite compilation) — must pass with
   zero errors. The `Omit<EmptyStateProps, 'action'>` type ensures any accidental `action` prop
   addition fails compilation.

3. **Sidebar collapse test:** Collapse sidebar (mobile drawer close / desktop collapse button),
   verify Program accordion toggle still works, and sessions-participants-reports-missions remain
   visible in correct order.

4. **No backend changes:** This is a frontend-only change; Go code, migrations, and API
   endpoints are untouched.

---

## Risk Assessment

- **Low risk** — all changes are client-side UI only; no API, data model, or backend changes.
- **Low risk** — `ListEmptyState` is a trivial wrapper; `EmptyState` component unchanged, so all 56
  existing callers are unaffected.
- **Low risk** — sidebar reorder is a 2-block JSX swap; `buildMenuSections` and `ADMIN_ROUTE_ACCESS`
  logic untouched.
- **Mitigation** — `Omit<EmptyStateProps, 'action'>` provides compile-time enforcement; `pnpm build`
  will fail if any caller of `ListEmptyState` accidentally passes `action`.
- **UX improvement** — consistent single "create" button per page, logical sidebar ordering matching
  the program→topic→activity→session workflow.

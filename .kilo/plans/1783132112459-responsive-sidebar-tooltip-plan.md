# Dashboard Responsive Fix + Sidebar Bug + Tooltip System

## Document Metadata

| Field | Value |
|-------|-------|
| **Title** | Responsive Layout Fix, Sidebar Bug Fix, Icon Tooltip System |
| **Status** | `EXECUTED` |
| **Scope** | AdminLayout, AppHeader, DashboardPage, SessionCarousel, Tooltip component, 26 icon-only buttons |
| **Out of scope** | Parent/Fasilitator dashboards |

---

## 1. Summary

Three categories of work:

1. **Sidebar fix** — Move toggle button to AppHeader for mobile; sidebar overlaps on mobile, pushes content on desktop
2. **Dashboard responsive** — Fix horizontal scrollbar, responsive session table, card layout on mobile
3. **Tooltip system** — Create reusable `<Tooltip>` component (pure CSS, zero deps), apply to all 26 icon-only buttons

---

## 2. Sidebar Fix

### 2.1 Problem

Current `AdminLayout.tsx` line 74-78:
```tsx
<aside className={cn(
  'fixed lg:relative',
  sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 lg:w-20'
)}>
```

- **Mobile (`< lg`)**: sidebar is `fixed` + `w-0 -translate-x-full` when collapsed
- **Bug**: Toggle button is INSIDE the sidebar footer (line 127-133). When collapsed on mobile, the button is hidden → no way to open sidebar
- **Desktop (`lg+`)**: sidebar is `relative` + `w-20` → correct, pushes content

### 2.2 Solution

#### `AppHeader.tsx` — Add hamburger button
- Accept new prop: `onMenuToggle?: () => void`
- Render `<Menu>` hamburger button left of search input, visible only `lg:hidden`
- When clicked → calls `onMenuToggle` which toggles sidebar state

#### `AdminLayout.tsx` — Pass state to AppHeader
- Pass `sidebarOpen` / `setSidebarOpen` to `<AppHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />`
- **Sidebar footer**: Remove the toggle button entirely. The hamburger in AppHeader is the only trigger
- **Mobile behavior**: sidebar stays `fixed` overlay with backdrop (unchanged)
- **Desktop behavior**: sidebar stays `relative` push (unchanged)
- Remove `Menu` import from lucide (no longer needed in sidebar footer)

### 2.3 AppHeader responsive adjustments
- Height: `h-20` → `h-16 lg:h-20` (tighter on mobile)
- Padding: `px-8` → `px-4 lg:px-8`
- Search input: `py-3` → `py-2.5 lg:py-3`
- Icon buttons: `w-10 h-10` → `w-9 h-9 lg:w-10 lg:h-10`
- Avatar: same size reduction

---

## 3. Dashboard Responsive

### 3.1 Problem — Horizontal Scrollbar

Three sources of overflow:
1. **Session table**: `min-w-[600px]` forces table wider than viewport
2. **SessionCarousel**: `min-w-[260px]` per card with `overflow-x-auto`
3. **Main content area**: no `overflow-x-hidden` → overflow expands viewport

### 3.2 Solution

#### `DashboardPage.tsx` — Responsive session table
- Remove `min-w-[600px]`
- **Desktop (`xl+`)**: Full 6-column table (unchanged)
- **Tablet (`md to xl`)**: Hide columns "Tanggal" and "Peserta" using `hidden md:table-cell` / `hidden xl:table-cell`
- **Mobile (`< md`)**: Convert to card-based layout. Each session becomes a card:
  ```
  ┌─────────────────────────┐
  │ Nama Sesi     [Status]  │
  │ Program Name            │
  │ Progress bar            │
  └─────────────────────────┘
  ```
- Grid breakpoints: `lg:col-span-9` → `xl:col-span-9` for better sidebar space
- Add `overflow-x-hidden` to `<main>` in AdminLayout

#### `SessionCarousel.tsx` — Overflow containment
- Add `overflow-hidden` on outer `<div>` wrapper
- Reduce `min-w-[260px]` → `min-w-[220px]` on cards

#### `CategoryCard.tsx` — No changes needed
- Already works well in grid layout

### 3.3 Responsive breakpoints reference

| Breakpoint | Width | Sidebar | Left col | Right col | Table |
|------------|-------|---------|----------|-----------|-------|
| `< md` | <768px | Overlay | 12 cols | 12 cols | Card layout |
| `md` | 768-1023px | Overlay | 12 cols | 12 cols | Table (4 cols, hide Tanggal+Peserta) |
| `lg` | 1024-1279px | Push w-20 | 9 cols | 3 cols | Table (5 cols, hide Peserta) |
| `xl` | ≥1280px | Push w-20 | 9 cols | 3 cols | Full table (6 cols) |

---

## 4. Tooltip System

### 4.1 Component Design

Create `src/shared/components/ui/Tooltip.tsx`:

- **Approach**: Pure CSS using Tailwind `group`/`group-hover` — zero JS runtime, zero dependencies
- **Theme**: Kotak polos (clean box), M3 tokens
- **Position**: Top by default (with `bottom` variant)

```tsx
// Implementation pattern:
// <div className="relative group inline-flex">
//   {children}
//   <div className="absolute ... opacity-0 group-hover:opacity-100 transition-opacity ...">
//     {content}
//   </div>
// </div>
```

**Visual spec:**
- `bg-inverse-surface text-inverse-on-surface` (dark tooltip on light bg)
- `rounded-lg px-2.5 py-1 text-xs font-medium`
- `shadow-md z-50 pointer-events-none`
- Arrow: small triangle via CSS borders (optional — skip for simplicity)
- Position: `bottom-full left-1/2 -translate-x-1/2 mb-2` (above element, centered)

### 4.2 Button integration

The `<Button>` component (`Button.tsx`) currently accepts `icon` and `children` but has no `tooltip` prop. Two approaches:

**Option A — Add `tooltip` prop to Button (Recommended)**
```tsx
interface ButtonProps {
  // ... existing props
  tooltip?: string
}
```
When `tooltip` is provided and there are no `children` (icon-only button), wrap with `<Tooltip>`.

**Option B — External wrapper**
Wrap each `<Button>` in `<Tooltip content="...">` at every call site.

**Recommendation**: Option A — cleaner, single source of truth, fewer changes at call sites.

### 4.3 Tooltip applied to raw buttons (non-Button component)

Some icon-only buttons are raw `<button>` elements, not `<Button>`:
- `Modal.tsx` close button (line 49-55)
- `StoriesPage.tsx` action buttons (line 106-114)
- `CategoryCard.tsx` MoreHorizontal button (line 21-23)
- `AppHeader.tsx` Video/Bell buttons (line 19-25)

For these, wrap with `<Tooltip content="...">` externally.

### 4.4 Complete icon-only button inventory

| # | File | Component | Icon | Tooltip Text | Integration |
|---|------|-----------|------|-------------|-------------|
| **AdminLayout sidebar** (desktop collapsed) | | | | | |
| 1 | `AdminLayout.tsx` | `<Link>` | `<LayoutDashboard>` | "Dashboard" | Wrap with `<Tooltip>` |
| 2 | `AdminLayout.tsx` | `<Link>` | `<FolderOpen>` | "Programs" | Wrap with `<Tooltip>` |
| 3 | `AdminLayout.tsx` | `<Link>` | `<Calendar>` | "Sessions" | Wrap with `<Tooltip>` |
| 4 | `AdminLayout.tsx` | `<Link>` | `<FileText>` | "Content Manager" | Wrap with `<Tooltip>` |
| 5 | `AdminLayout.tsx` | `<Link>` | `<Image>` | "Frame Manager" | Wrap with `<Tooltip>` |
| 6 | `AdminLayout.tsx` | `<Link>` | `<Users>` | "Users" | Wrap with `<Tooltip>` |
| 7 | `AdminLayout.tsx` | `<button>` | `<LogOut>` | "Keluar" | Wrap with `<Tooltip>` |
| **AppHeader** | | | | | |
| 8 | `AppHeader.tsx` | `<button>` | `<Menu>` | "Menu" | Wrap with `<Tooltip>` |
| 9 | `AppHeader.tsx` | `<button>` | `<Video>` | "Video" | Wrap with `<Tooltip>` |
| 10 | `AppHeader.tsx` | `<button>` | `<Bell>` | "Notifikasi" | Wrap with `<Tooltip>` |
| **Modal** | | | | | |
| 11 | `Modal.tsx` | `<button>` | `<X>` | "Tutup" | Wrap with `<Tooltip>` |
| **CategoryCard** | | | | | |
| 12 | `CategoryCard.tsx` | `<button>` | `<MoreHorizontal>` | "Lainnya" | Wrap with `<Tooltip>` |
| **ProgramsPage** | | | | | |
| 13 | `ProgramsPage.tsx` | `<Button>` | `<Pencil>` | "Edit" | `tooltip="Edit"` prop |
| 14 | `ProgramsPage.tsx` | `<Button>` | `<ToggleLeft/ToggleRight>` | "Ubah Status" | `tooltip="Ubah Status"` prop |
| 15 | `ProgramsPage.tsx` | `<Button>` | `<Trash2>` | "Hapus" | `tooltip="Hapus"` prop |
| **SessionsPage** | | | | | |
| 16 | `SessionsPage.tsx` | `<Button>` | `<Eye>` | "Lihat Detail" | `tooltip="Lihat Detail"` prop |
| 17 | `SessionsPage.tsx` | `<Button>` | `<Play>` | "Mulai Sesi" | `tooltip="Mulai Sesi"` prop |
| 18 | `SessionsPage.tsx` | `<Button>` | `<X>` | "Batalkan" | `tooltip="Batalkan"` prop |
| **UsersPage** | | | | | |
| 19 | `UsersPage.tsx` | `<Button>` | `<Pencil>` | "Edit" | `tooltip="Edit"` prop |
| 20 | `UsersPage.tsx` | `<Button>` | `<Trash2>` | "Nonaktifkan" | `tooltip="Nonaktifkan"` prop |
| **ProgramDetailPage** | | | | | |
| 21 | `ProgramDetailPage.tsx` | `<Button>` | `<Pencil>` | "Edit Stage" | `tooltip="Edit Stage"` prop |
| 22 | `ProgramDetailPage.tsx` | `<Button>` | `<Trash2>` | "Hapus Stage" | `tooltip="Hapus Stage"` prop |
| **StoriesPage** | | | | | |
| 23 | `StoriesPage.tsx` | `<button>` | `<Eye>` | "Lihat" | Wrap with `<Tooltip>` |
| 24 | `StoriesPage.tsx` | `<button>` | `<Edit>` | "Edit" | Wrap with `<Tooltip>` |
| 25 | `StoriesPage.tsx` | `<button>` | `<Trash2>` | "Hapus" | Wrap with `<Tooltip>` |

**NOT included** (already have text labels or are self-explanatory form toggles):
- `DataTable.tsx` checkboxes — native form elements, `aria-label` sufficient
- `RegisterPage.tsx` / `LoginPage.tsx` `<Eye/EyeOff>` — password visibility toggle, universally understood
- `TeamList.tsx` "Follow"/"Following" — has text label
- Buttons with text children (e.g. "Buat Program", "Tambah User") — self-explanatory

---

## 5. File Change Summary

### New (1)
| File | Reason |
|------|--------|
| `src/shared/components/ui/Tooltip.tsx` | Pure CSS tooltip component |

### Modified (10)
| File | Changes |
|------|---------|
| `src/shared/components/layout/AppHeader.tsx` | Add `onMenuToggle` prop + hamburger button, responsive sizing |
| `src/shared/layouts/AdminLayout.tsx` | Pass `onMenuToggle` to AppHeader, remove sidebar footer toggle button, add `overflow-x-hidden` to main |
| `src/shared/components/ui/Button.tsx` | Add `tooltip?: string` prop, wrap icon-only with `<Tooltip>` |
| `src/features/admin/pages/DashboardPage.tsx` | Responsive table (card on mobile, hide columns on tablet) |
| `src/shared/components/data/SessionCarousel.tsx` | `overflow-hidden` wrapper, reduce `min-w` |
| `src/shared/components/ui/Modal.tsx` | Add `<Tooltip>` to close button |
| `src/shared/components/ui/CategoryCard.tsx` | Add `<Tooltip>` to MoreHorizontal button |
| `src/features/admin/pages/ProgramsPage.tsx` | Add `tooltip` props to icon buttons |
| `src/features/admin/pages/SessionsPage.tsx` | Add `tooltip` props to icon buttons |
| `src/features/admin/pages/UsersPage.tsx` | Add `tooltip` props to icon buttons |
| `src/features/admin/pages/StoriesPage.tsx` | Wrap raw icon buttons with `<Tooltip>` |
| `src/features/admin/pages/ProgramDetailPage.tsx` | Add `tooltip` props to icon buttons |

---

## 6. Implementation Order

1. **Tooltip component** — Create `Tooltip.tsx` (no dependencies, foundation for everything else)
2. **Button tooltip prop** — Add `tooltip` prop to `Button.tsx`
3. **AppHeader + AdminLayout** — Sidebar toggle fix (hamburger in header, remove footer toggle)
4. **DashboardPage + SessionCarousel** — Responsive layout (overflow fix, responsive table)
5. **Apply tooltips** — Modal, CategoryCard, ProgramsPage, SessionsPage, UsersPage, StoriesPage, ProgramDetailPage
6. **Build test** — `pnpm build`

---

## 7. Validation

| # | Test | Expected |
|---|------|----------|
| 1 | `pnpm build` | Zero errors |
| 2 | Mobile viewport (< 768px) | Hamburger visible in header, sidebar opens as overlay, no horizontal scroll |
| 3 | Tablet viewport (768-1023px) | Hamburger visible, sidebar overlay, table hides Tanggal+Peserta columns |
| 4 | Desktop viewport (≥1280px) | No hamburger, sidebar pushes content, full 6-column table |
| 5 | Sidebar collapsed (desktop) | Nav icons show tooltip on hover |
| 6 | Any icon-only button hover | Tooltip appears after ~300ms delay, clean box style |
| 7 | Dashboard cards | No horizontal scrollbar at any viewport width |
| 8 | SessionCarousel | Cards contained, no overflow outside container |

# Fix Plan: Sidebar Toggle, Responsive Table, Tooltip Clipping

## Document Metadata

| Field | Value |
|-------|-------|
| **Title** | Fix Plan — Sidebar Desktop Toggle, Dashboard Table Breakpoint, Tooltip Overflow Clipping |
| **Status** | `EXECUTED` |
| **Scope** | AdminLayout, AppHeader, Tooltip, Button, DashboardPage |
| **Related plan** | `1783132112459-responsive-sidebar-tooltip-plan.md` (original, already EXECUTED) |

---

## 1. Summary

Four issues found during audit of the executed plan. Two are critical, two are minor.

| # | Severity | Issue | File |
|---|----------|-------|------|
| 1 | **CRITICAL** | Desktop sidebar has no expand/collapse toggle — permanently stuck at `w-20` | AdminLayout |
| 2 | **MINOR** | Hamburger button placed on right side instead of left of search input | AppHeader |
| 3 | **MINOR** | Tanggal column hidden below xl (1280px) — should be hidden below lg (1024px) | DashboardPage |
| 4 | **CRITICAL** | 5 of 7 tooltip locations clipped by `overflow` ancestors — tooltip bubbles get cut off | Tooltip |

---

## 2. Issue 1 — Desktop Sidebar Toggle (CRITICAL)

### 2.1 Problem

The original plan removed the sidebar footer toggle button entirely, stating "The hamburger in AppHeader is the only trigger." But the hamburger button is `lg:hidden` (AppHeader:28), so on desktop (`lg+`) there is **no way to expand the sidebar** from `w-20` to `w-64`.

### 2.2 Fix

Add a **desktop-only toggle button** back to the sidebar footer. This button is visible only on `lg+` and toggles between `PanelLeftClose` (collapse) and `PanelLeftOpen` (expand) icons.

#### `AdminLayout.tsx`

**Import changes:**
- Add `PanelLeftClose, PanelLeftOpen` to the lucide-react import
- Remove `Menu, X` (already removed, just verify they're gone)

**Footer section (lines 128-148) — replace with:**

```tsx
{/* Footer */}
<div className="p-4 border-t border-outline-variant space-y-2">
  {/* Desktop toggle — lg+ only */}
  <button
    onClick={() => setSidebarOpen(!sidebarOpen)}
    className="hidden lg:flex items-center gap-3 px-4 py-2 w-full text-left hover:bg-surface-container rounded-xl transition-colors text-on-surface-variant text-sm"
  >
    {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
    {sidebarOpen && <span>Tutup Sidebar</span>}
  </button>
  {/* Logout */}
  {!sidebarOpen ? (
    <Tooltip content="Keluar">
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-4 py-2 w-full text-left hover:bg-error-container rounded-xl transition-colors text-on-surface-variant hover:text-on-error-container justify-center"
      >
        <LogOut className="w-5 h-5" />
      </button>
    </Tooltip>
  ) : (
    <button
      onClick={handleLogout}
      className="flex items-center gap-3 px-4 py-2 w-full text-left hover:bg-error-container rounded-xl transition-colors text-sm text-on-surface-variant hover:text-on-error-container"
    >
      <LogOut className="w-5 h-5" />
      <span>Keluar</span>
    </button>
  )}
</div>
```

**Behavior:**
- Mobile (`< lg`): toggle button `hidden lg:flex` → invisible. Hamburger in AppHeader handles toggle.
- Desktop (`lg+`): toggle button visible in sidebar footer. Hamburger in AppHeader `lg:hidden` → invisible.
- Both trigger the same `setSidebarOpen(!sidebarOpen)`.

---

## 3. Issue 2 — Hamburger Position (MINOR)

### 3.1 Problem

The original plan specified the hamburger should be rendered **left of the search input**. The implementation placed it in the **right section** (next to Video/Bell buttons).

### 3.2 Fix

Move the hamburger button from the right section to a new left section, before the search input.

#### `AppHeader.tsx`

**Restructure the header layout from:**

```tsx
<header>
  <div class="search input" />
  <div class="right buttons">
    {onMenuToggle && hamburger}
    Video, Bell, Avatar
  </div>
</header>
```

**To:**

```tsx
<header>
  {onMenuToggle && hamburger}   {/* NEW: left of search */}
  <div class="search input" />
  <div class="right buttons">
    Video, Bell, Avatar
  </div>
</header>
```

**Full updated AppHeader:**

```tsx
import { Search, Video, Bell, Menu } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { Tooltip } from '../ui/Tooltip'

interface AppHeaderProps {
  onMenuToggle?: () => void
}

export function AppHeader({ onMenuToggle }: AppHeaderProps) {
  const { user } = useAuth()

  return (
    <header className="h-16 lg:h-20 flex-shrink-0 flex items-center gap-3 px-4 lg:px-8 bg-surface border-b border-outline-variant">
      {onMenuToggle && (
        <Tooltip content="Menu">
          <button
            onClick={onMenuToggle}
            className="lg:hidden shrink-0 w-9 h-9 rounded-full bg-surface shadow-sm flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </Tooltip>
      )}
      <div className="relative w-full max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
        <input
          type="text"
          placeholder="Cari program, sesi, peserta..."
          className="w-full bg-surface-container-low border-0 rounded-2xl py-2.5 lg:py-3 pl-12 pr-4 text-sm text-on-surface placeholder-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
        />
      </div>
      <div className="flex items-center gap-4 ml-auto shrink-0">
        <Tooltip content="Video">
          <button className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-surface shadow-sm flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
            <Video className="w-5 h-5" />
          </button>
        </Tooltip>
        <Tooltip content="Notifikasi">
          <button className="relative w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-surface shadow-sm flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full" />
          </button>
        </Tooltip>
        {user && (
          <div className="flex items-center gap-3 ml-2">
            <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-full border border-outline-variant overflow-hidden flex items-center justify-center bg-primary-container text-on-primary-container font-bold text-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-on-surface hidden md:block">{user.name}</span>
          </div>
        )}
      </div>
    </header>
  )
}
```

**Key changes:**
- Hamburger placed before search input, visible only `lg:hidden`
- Search input uses `flex-1` via `w-full` (stays same, inside its wrapper)
- Right buttons section uses `ml-auto` to push to the right edge
- `shrink-0` on hamburger and right section to prevent flex shrinking

---

## 4. Issue 3 — Tanggal Column Breakpoint (MINOR)

### 4.1 Problem

The plan's breakpoint table specifies:

| Viewport | Columns shown |
|----------|--------------|
| `< md` | Card layout |
| `md` (768-1023) | 4 cols: Nama Sesi, Program, Status, Progress |
| `lg` (1024-1279) | 5 cols: Nama Sesi, Program, **Tanggal**, Status, Progress |
| `xl` (≥1280) | Full 6 cols |

Current implementation uses `hidden xl:table-cell` for **both** Tanggal and Peserta columns. This means Tanggal is hidden at lg (1024-1279), when it should be visible.

### 4.2 Fix

#### `DashboardPage.tsx`

**Table header (lines 81, 83):**

| Column | Current | Correct |
|--------|---------|---------|
| Tanggal | `hidden xl:table-cell` | `hidden lg:table-cell` |
| Peserta | `hidden xl:table-cell` | `hidden xl:table-cell` (no change) |

**Table body (lines 92, 102):**

| Column | Current | Correct |
|--------|---------|---------|
| Tanggal | `hidden xl:table-cell` | `hidden lg:table-cell` |
| Peserta | `hidden xl:table-cell` | `hidden xl:table-cell` (no change) |

**4 edits total** — change `xl:table-cell` → `lg:table-cell` on the 4 Tanggal-related elements (2 `<th>`, 2 `<td>`).

---

## 5. Issue 4 — Tooltip Overflow Clipping (CRITICAL)

### 5.1 Problem

The current Tooltip uses `position: absolute` inside a `relative` wrapper. When any ancestor has `overflow: hidden/auto/scroll`, the tooltip bubble is clipped.

**CSS spec detail:** When `overflow-y` is set to anything other than `visible`, the computed value of `overflow-x` automatically becomes `auto` (not `visible`). So `overflow-y-auto` effectively clips both axes.

**Affected locations (5 of 7):**

| Location | Ancestor overflow | Clipped? |
|----------|-------------------|----------|
| Sidebar nav links | `<nav class="overflow-y-auto">` AdminLayout:89 | **YES** |
| Sidebar footer logout | `<aside>` (no overflow) | OK |
| AppHeader buttons | `<header>` (no overflow) | OK |
| CategoryCard "Lainnya" | `<main class="overflow-x-hidden overflow-y-auto">` AdminLayout:154 | **YES** |
| DataTable action buttons | `<main class="overflow-x-hidden overflow-y-auto">` | **YES** |
| StoriesPage action buttons | `<main>` + `<div class="overflow-hidden">` StoriesPage:69 | **YES (double)** |
| Modal close button | `<div class="fixed inset-0">` (no overflow) | OK |

### 5.2 Solution — Portal-based Tooltip

Replace the pure-CSS `group-hover` + `position: absolute` approach with a portal-based approach that renders the tooltip into `document.body`, completely outside all overflow containers.

This sacrifices "pure CSS, zero JS" but there is **no CSS-only way to escape overflow containers**. Every production UI library (Radix, Headless UI, Shadcn, MUI) uses portal + JS measurement for tooltips.

#### `Tooltip.tsx` — Complete rewrite

```tsx
import { useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  content: string
  children: React.ReactNode
  position?: 'top' | 'bottom'
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null)

  const show = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setCoords({
      x: rect.left + rect.width / 2,
      y: position === 'top' ? rect.top : rect.bottom,
    })
  }, [position])

  const hide = useCallback(() => {
    setCoords(null)
  }, [])

  const tooltipStyle: React.CSSProperties = coords
    ? {
        position: 'fixed',
        left: coords.x,
        transform: 'translateX(-50%)',
        ...(position === 'top'
          ? { bottom: 'auto', top: coords.y - 8, translateY: '-100%' }
          : { top: coords.y + 8, bottom: 'auto' }),
      }
    : { position: 'fixed', opacity: 0, pointerEvents: 'none' }

  return (
    <>
      <div
        ref={triggerRef}
        className="relative inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
      </div>
      {createPortal(
        <div
          style={tooltipStyle}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg bg-inverse-surface text-inverse-on-surface shadow-md z-[9999] pointer-events-none whitespace-nowrap transition-opacity duration-200 ${
            coords ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  )
}
```

**Key design decisions:**

1. **`createPortal` to `document.body`** — tooltip renders outside all overflow containers
2. **`position: fixed`** — positioned relative to viewport, not any ancestor
3. **`getBoundingClientRect()`** — measures trigger element position on hover
4. **`onMouseEnter`/`onMouseLeave`** — replaces CSS `group-hover` (broken by portal)
5. **`z-[9999]`** — ensures tooltip is above everything (Modal uses `z-50`, sidebar `z-50`)
6. **`transition-opacity duration-200`** — keeps smooth fade-in animation via inline opacity toggle
7. **No new dependencies** — uses only React built-ins (`useRef`, `useState`, `useCallback`, `createPortal`)

**Impact on existing callers:**

The Tooltip API (`content`, `children`, `position`) stays identical. All 25+ call sites across AdminLayout, AppHeader, Modal, CategoryCard, ProgramsPage, SessionsPage, UsersPage, StoriesPage, ProgramDetailPage, and Button.tsx work without changes.

The only behavioral change: `group-hover` CSS is replaced by `onMouseEnter`/`onMouseLeave` JS events. This is functionally identical — tooltip appears on hover, disappears on mouse leave.

### 5.3 Button.tsx — No changes needed

Button.tsx wraps icon-only buttons with `<Tooltip content={tooltip}>`. Since the Tooltip API is unchanged, Button.tsx requires no modifications.

---

## 6. File Change Summary

### Modified (4)

| File | Changes | Issues addressed |
|------|---------|-----------------|
| `src/shared/components/ui/Tooltip.tsx` | Complete rewrite: portal-based with `position: fixed`, `getBoundingClientRect`, `onMouseEnter`/`onMouseLeave` | Issue 4 |
| `src/shared/layouts/AdminLayout.tsx` | Add `PanelLeftClose`/`PanelLeftOpen` imports, add desktop toggle button in sidebar footer | Issue 1 |
| `src/shared/components/layout/AppHeader.tsx` | Move hamburger to left of search input, restructure header layout | Issue 2 |
| `src/features/admin/pages/DashboardPage.tsx` | Change Tanggal column from `hidden xl:table-cell` to `hidden lg:table-cell` (4 elements) | Issue 3 |

### Unchanged (all other files)

Button.tsx, Modal.tsx, CategoryCard.tsx, ProgramsPage.tsx, SessionsPage.tsx, UsersPage.tsx, StoriesPage.tsx, ProgramDetailPage.tsx, SessionCarousel.tsx — **no changes needed**. Tooltip API is backward-compatible.

---

## 7. Implementation Order

1. **Tooltip rewrite** — Foundation fix, all other tooltips depend on it
2. **AdminLayout sidebar toggle** — Add desktop expand/collapse button
3. **AppHeader hamburger reposition** — Move to left of search
4. **DashboardPage Tanggal breakpoint** — Change `xl:table-cell` → `lg:table-cell`
5. **Build test** — `pnpm build`

---

## 8. Validation

| # | Test | Expected |
|---|------|----------|
| 1 | `pnpm build` | Zero errors |
| 2 | Desktop sidebar collapsed (`lg+`, `w-20`) | Toggle button visible in footer with `PanelLeftOpen` icon |
| 3 | Desktop sidebar expanded (`lg+`, `w-64`) | Toggle button shows `PanelLeftClose` icon + "Tutup Sidebar" text |
| 4 | Mobile (`< lg`) | No toggle in footer. Hamburger visible left of search input |
| 5 | Hover sidebar nav icon (collapsed, desktop) | Tooltip appears above, NOT clipped by `<nav overflow-y-auto>` |
| 6 | Hover any DataTable action button | Tooltip appears above, NOT clipped by `<main overflow-x-hidden>` |
| 7 | Hover StoriesPage action button | Tooltip appears above, NOT clipped by `<div overflow-hidden>` |
| 8 | Hover CategoryCard "Lainnya" | Tooltip appears above, not clipped |
| 9 | Tablet viewport (1024-1279px) | Dashboard table shows 5 columns: Nama Sesi, Program, **Tanggal**, Status, Progress |
| 10 | Mobile viewport (< 768px) | Dashboard shows card layout for sessions, no table |

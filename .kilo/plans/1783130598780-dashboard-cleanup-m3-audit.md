# Dashboard Cleanup + M3 Component Audit

## Document Metadata

| Field | Value |
|-------|-------|
| **Title** | Dashboard Greeting Cleanup + Full M3 Token Migration |
| **Status** | `EXECUTED` |
| **Scope** | Shared UI components + Admin feature pages |
| **Out of scope** | Parent/Fasilitator dashboards (separate sprint) |

---

## 1. Summary

Three categories of work:

1. **Greeting dedup** — Remove `GreetingBanner` hero, make `DonutStat` a collapsible greeting sidebar (matching template `dashboard.html` right sidebar pattern)
2. **Duplication fix** — ProgramsPage has two "Buat/Tambah Program" buttons
3. **M3 token migration** — 201 instances of `gray-*` tokens across 14 files need M3 equivalents

---

## 2. Greeting Dedup

### 2.1 Delete `GreetingBanner.tsx`

**File**: `src/shared/components/ui/GreetingBanner.tsx` — DELETE

### 2.2 Rewrite `DonutStat.tsx` → Collapsible Greeting

**File**: `src/shared/components/charts/DonutStat.tsx`

Transform into a collapsible card matching the template's right sidebar Statistic section. Structure:

- Header row: "Statistik" title + `ChevronDown`/`ChevronUp` toggle
- Collapsed: only header visible
- Expanded: donut SVG + percentage badge + avatar initial + greeting text + motivational subtitle

```tsx
// Key changes:
- Add `useState(true)` for expanded state
- Add ChevronDown/ChevronUp from lucide-react
- Wrap content in `{expanded && (...)}` conditional
- Keep existing donut SVG + percentage logic
- Keep greeting + motivational text
- Toggle button on header row
```

### 2.3 Update `DashboardPage.tsx`

**File**: `src/features/admin/pages/DashboardPage.tsx`

- Remove `import { GreetingBanner }` (line 6)
- Remove `<GreetingBanner />` (line 27)
- Keep everything else unchanged

---

## 3. ProgramsPage Duplication Fix

**File**: `src/features/admin/pages/ProgramsPage.tsx`

Two "Buat Program" buttons exist:
- Line 107-111: `PageHeader` actions → `<Button>Buat Program</Button>` ✅ KEEP
- Line 123-127: `DataTable` actions → `<Button>Tambah Program</Button>` ❌ REMOVE

**Action**: Delete the `actions` prop from `<DataTable>` (lines 123-127).

---

## 4. M3 Token Migration

### Token Mapping Reference

| Gray Token | M3 Replacement |
|------------|---------------|
| `bg-white` | `bg-surface` |
| `bg-gray-50` | `bg-surface-container-low` |
| `bg-gray-100` | `bg-surface-container-high` |
| `bg-gray-200` | `bg-surface-container-highest` |
| `text-gray-900` | `text-on-surface` |
| `text-gray-800` | `text-on-surface` |
| `text-gray-700` | `text-on-surface` |
| `text-gray-600` | `text-on-surface` |
| `text-gray-500` | `text-on-surface-variant` |
| `text-gray-400` | `text-on-surface-variant` |
| `text-gray-300` | `text-on-surface-variant/30` |
| `border-gray-100` | REMOVE (not needed with shadow-sm) |
| `border-gray-200` | `border-outline-variant` |
| `border-gray-300` | `border-outline-variant` |
| `divide-gray-100` | `divide-outline-variant/50` |
| `hover:bg-gray-50` | `hover:bg-surface-container-low/50` |
| `hover:bg-gray-100` | `hover:bg-surface-container` |
| `rounded-lg` (containers) | `rounded-2xl` |
| `rounded-xl` (containers) | `rounded-2xl` or `rounded-3xl` |
| `bg-red-500` | `bg-error` |
| `text-red-500` (icons) | `text-error` |
| `text-red-600` | `text-on-error-container` |
| `border-red-500` | `border-error` |
| `text-green-600` | `text-green-700` (keep) |
| `text-yellow-600` | `text-yellow-700` (keep) |
| `text-blue-600` | `text-blue-700` (keep) |

### 4.1 Shared Components (core UI kit)

#### `Modal.tsx` — Full rewrite
- `bg-white rounded-xl` → `bg-surface rounded-2xl`
- Header: `border-b` → `border-b border-outline-variant`
- `text-gray-900` → `text-on-surface`
- `text-gray-400 hover:text-gray-600 hover:bg-gray-100` → `text-on-surface-variant hover:text-on-surface hover:bg-surface-container`
- Footer: `border-t bg-gray-50 rounded-b-xl` → `border-t border-outline-variant bg-surface-container-low rounded-b-2xl`

#### `DataTable.tsx` — Targeted edits (16 changes)
- Search input: `border border-gray-300 rounded-lg` → `bg-surface-container-low rounded-2xl border-0`
- Table container: `bg-white rounded-xl shadow-sm border border-gray-100` → `bg-surface rounded-2xl shadow-sm`
- Table header: `bg-gray-50 border-b border-gray-200` → `bg-surface-container-low border-b border-outline-variant`
- Column headers: `text-gray-500` → `text-on-surface-variant`
- Body: `divide-y divide-gray-100` → `divide-y divide-outline-variant/50`
- Rows: `hover:bg-gray-50` → `hover:bg-surface-container-low/50`
- Selected: `bg-primary-50` → `bg-primary-container/30`
- Loading skeleton: `bg-gray-100` → `bg-surface-container-high`
- Cell text: `text-gray-900` → `text-on-surface`
- Pagination bar: `border-t border-gray-200` → `border-t border-outline-variant`
- Pagination text: `text-gray-500` → `text-on-surface-variant`
- Pagination buttons: `border border-gray-300 hover:bg-gray-50` → `border border-outline-variant hover:bg-surface-container-low`

#### `Button.tsx` — Full rewrite
- `rounded-lg` → `rounded-xl`
- Secondary: `bg-white border border-primary` → `bg-surface border border-primary`
- Ghost: `bg-primary-100` → `bg-primary-container/50`
- Danger: `bg-red-500` → `bg-error`
- Spinner border: `border-white` → `border-on-primary`

#### `Input.tsx` — Full rewrite
- Label: `text-gray-700` → `text-on-surface`
- Input: `border-gray-300 bg-white` → `border-outline-variant bg-surface`
- Focus: `focus:ring-primary-100` → `focus:ring-primary-container`
- Disabled: `bg-gray-50 text-gray-500` → `bg-surface-container-low text-on-surface-variant`
- Error: `border-red-500 focus:ring-red-100` → `border-error focus:ring-error-container`
- Error text: `text-red-500` → `text-error`
- Hint: `text-gray-500` → `text-on-surface-variant`
- Icons: `text-gray-400` → `text-on-surface-variant`
- `rounded-lg` → `rounded-xl`

#### `Select.tsx` — Full rewrite
- Same pattern as Input.tsx

#### `Tabs.tsx` — Full rewrite
- Container: `border-gray-200` → `border-outline-variant`
- Inactive: `text-gray-500 hover:text-gray-700 hover:border-gray-300` → `text-on-surface-variant hover:text-on-surface hover:border-outline-variant`

#### `EmptyState.tsx` — Full rewrite
- Icon: `text-gray-300` → `text-on-surface-variant/30`
- Title: `text-gray-900` → `text-on-surface`
- Description: `text-gray-500` → `text-on-surface-variant`
- Button: `bg-primary rounded-lg` → `bg-primary rounded-xl`

#### `Toast.tsx` — Targeted edits
- Container: `rounded-lg` → `rounded-2xl`
- Error config: `text-red-600 bg-red-50 border-red-200` → `text-on-error-container bg-error-container border-error-container`
- Message text: `text-gray-900` → `text-on-surface`

#### `PageHeader.tsx` — Full rewrite
- Breadcrumbs: `text-gray-500` → `text-on-surface-variant`
- Separator: `text-gray-300` → `text-on-surface-variant/40`
- Link hover: `hover:text-gray-700` → `hover:text-on-surface`
- Active crumb: `text-gray-700` → `text-on-surface`
- Title: `text-gray-900` → `text-on-surface`
- Subtitle: `text-gray-500` → `text-on-surface-variant`

### 4.2 Admin Feature Pages (inline gray tokens)

These pages have `gray-*` tokens inside column renders, form labels, and inline JSX. Each needs targeted `text-gray-*` → M3 replacements.

#### `ProgramsPage.tsx`
- Line 64: `text-gray-900` → `text-on-surface`
- Line 65: `text-gray-500` → `text-on-surface-variant`
- Line 96: `text-red-500` → `text-error`
- Line 144: `text-gray-600` → `text-on-surface-variant`

#### `SessionsPage.tsx`
- Line 58: `text-gray-900` → `text-on-surface`
- Line 59: `text-gray-500` → `text-on-surface-variant`
- Line 136: `text-gray-600` → `text-on-surface-variant`

#### `StoriesPage.tsx` (heavy — table + search)
- Search container: `bg-white rounded-xl border border-gray-100` → `bg-surface rounded-2xl shadow-sm`
- Search icon: `text-gray-400` → `text-on-surface-variant`
- Search input: `border-gray-300 rounded-lg` → `border-outline-variant rounded-2xl`
- Table container: `bg-white rounded-xl border border-gray-100` → `bg-surface rounded-2xl shadow-sm`
- Table header: `bg-gray-50` → `bg-surface-container-low`
- Column headers: `text-gray-500` → `text-on-surface-variant`
- Body: `divide-y divide-gray-100` → `divide-y divide-outline-variant/50`
- Rows: `hover:bg-gray-50` → `hover:bg-surface-container-low/50`
- Cell text: `text-gray-800` → `text-on-surface`, `text-gray-600` → `text-on-surface-variant`
- Action buttons: `text-gray-400` → `text-on-surface-variant`

#### `FramesPage.tsx`
- Placeholder bg: `bg-gray-100` → `bg-surface-container-high`
- Placeholder icon: `text-gray-300` → `text-on-surface-variant/30`
- Text: `text-gray-900` → `text-on-surface`, `text-gray-500` → `text-on-surface-variant`
- Upload area: `border-gray-300` → `border-outline-variant`
- Upload icon: `text-gray-400` → `text-on-surface-variant`

#### `UsersPage.tsx`
- Line 83: `text-gray-900` → `text-on-surface`, `text-gray-500` → `text-on-surface-variant`

#### `ContentPage.tsx`
- Text: `text-gray-900` → `text-on-surface`, `text-gray-500` → `text-on-surface-variant`
- Upload area: `border-gray-300` → `border-outline-variant`, `text-gray-400` → `text-on-surface-variant`

#### `ProgramDetailPage.tsx`
- Form labels: `text-gray-700` → `text-on-surface`
- Inputs: `border-gray-300` → `border-outline-variant`
- Checkboxes: `border-gray-300` → `border-outline-variant`
- Text: `text-gray-900` → `text-on-surface`, `text-gray-500` → `text-on-surface-variant`
- Grip icon: `text-gray-300` → `text-on-surface-variant/30`

#### `SessionDetailPage.tsx`
- Text: `text-gray-500` → `text-on-surface-variant`, `text-gray-900` → `text-on-surface`
- Stage cards: `bg-gray-50` → `bg-surface-container-low`
- Input: `border-gray-300` → `border-outline-variant`
- Participant cards: `bg-gray-50` → `bg-surface-container-low`

---

## 5. File Change Summary

### Deleted (1)
| File | Reason |
|------|--------|
| `src/shared/components/ui/GreetingBanner.tsx` | Replaced by DonutStat collapsible greeting |

### Full Rewrites (7)
| File | Reason |
|------|--------|
| `src/shared/components/charts/DonutStat.tsx` | Collapsible greeting sidebar |
| `src/shared/components/ui/Modal.tsx` | M3 tokens |
| `src/shared/components/ui/Button.tsx` | M3 tokens + rounded-xl |
| `src/shared/components/ui/Input.tsx` | M3 tokens |
| `src/shared/components/ui/Select.tsx` | M3 tokens |
| `src/shared/components/ui/Tabs.tsx` | M3 tokens |
| `src/shared/components/ui/PageHeader.tsx` | M3 tokens |

### Targeted Edits (11)
| File | Changes |
|------|---------|
| `src/features/admin/pages/DashboardPage.tsx` | Remove GreetingBanner import + usage |
| `src/features/admin/pages/ProgramsPage.tsx` | Remove duplicate button + gray tokens |
| `src/shared/components/data/DataTable.tsx` | 16 gray→M3 edits |
| `src/shared/components/feedback/EmptyState.tsx` | M3 tokens |
| `src/shared/components/feedback/Toast.tsx` | M3 tokens |
| `src/features/admin/pages/SessionsPage.tsx` | 3 gray→M3 edits |
| `src/features/admin/pages/StoriesPage.tsx` | ~15 gray→M3 edits |
| `src/features/admin/pages/FramesPage.tsx` | ~6 gray→M3 edits |
| `src/features/admin/pages/UsersPage.tsx` | 1 gray→M3 edit |
| `src/features/admin/pages/ContentPage.tsx` | ~5 gray→M3 edits |
| `src/features/admin/pages/ProgramDetailPage.tsx` | ~10 gray→M3 edits |
| `src/features/admin/pages/SessionDetailPage.tsx` | ~10 gray→M3 edits |

---

## 6. Implementation Order

1. **Greeting dedup** — Delete GreetingBanner, rewrite DonutStat, update DashboardPage
2. **ProgramsPage fix** — Remove duplicate button
3. **Core UI kit M3** — Modal, DataTable, Button, Input, Select, Tabs, EmptyState, Toast, PageHeader
4. **Admin pages M3** — StoriesPage, FramesPage, ProgramDetailPage, SessionDetailPage, SessionsPage, UsersPage, ContentPage, ProgramsPage (gray tokens)
5. **Build test** — `pnpm build`

---

## 7. Validation

| # | Test | Expected |
|---|------|----------|
| 1 | `pnpm build` | Zero errors |
| 2 | Dashboard right sidebar | DonutStat collapsible, greeting shows on expand |
| 3 | Dashboard top | No hero/banner section |
| 4 | ProgramsPage | Single "Buat Program" button in PageHeader |
| 5 | All components | No `gray-*` Tailwind classes remaining in shared components |
| 6 | Admin pages | No `gray-*` Tailwind classes in rendered output |

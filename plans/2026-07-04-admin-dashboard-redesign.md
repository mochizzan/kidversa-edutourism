# Admin Dashboard Redesign & UI Consistency Plan

## Document Metadata

| Field | Value |
|-------|-------|
| **Title** | Admin Dashboard Redesign & UI Consistency Overhaul |
| **Timestamp** | 2026-07-04T03:42:42+07:00 |
| **Blueprint Version** | 1.0 |
| **Schema Reference** | ERD v1.0 (Kidversa ERD), FSD v1.0 (Kidversa FSD), BRD v3.0 (Kidversa BRD) |
| **Status** | `PENDING EXECUTION` |

---

## 1. Executive Summary

This plan addresses the critical gap between the current Admin Dashboard implementation and the specifications defined in FSD §22.1 (Reporting & Analytics). The current dashboard displays only 3 basic stat cards and 2 empty info cards, lacking charts, activity feeds, and the layout flexibility required for an effective admin experience.

### Scope of Work

1. **Admin Dashboard Complete Rewrite** — Full-width layout with chart visualizations (Bar + Pie), stat cards, and activity feed
2. **Reusable Component Library** — Create `PageHeader`, `StatCard`, chart components, and `DashboardLayout` with layout switching
3. **Mock Data Layer** — Structured mock data for all dashboard components
4. **UI Consistency Pass** — Update all admin pages, fasilitator dashboard, and parent dashboard for consistent styling
5. **Dependency Addition** — Install Recharts v3.9.1 for chart visualizations

### Design Principles

- **Full-width default** with optional 2-column layout via mobile-friendly switch/collapse
- **Harmonious chart colors** — Composed palette that is colorful, distinguishable, and accessible
- **Consistent typography** — `text-gray-900` for headings, `text-gray-500` for body, `space-y-6` wrapper pattern
- **Mobile-first responsive** — All components work on mobile, tablet, and desktop

---

## 2. Architectural Specification & Schema

### 2.1 Data Contracts (Mock Data)

#### Dashboard Statistics

```typescript
// features/admin/mock/dashboard.ts

interface DashboardStats {
  totalPrograms: number;        // Total program Edu Wisata
  activeSessions: number;       // Sesi dengan status ACTIVE
  totalParticipants: number;    // Total peserta di semua sesi aktif
  reportsSent: number;          // Raport yang sudah SENT
  reportsTotal: number;         // Total raport yang perlu dikirim
}

interface StageAverage {
  stageName: string;            // Nama stage, misal "Sapa Profesi"
  averageRating: number;        // Rata-rata bintang 1-5
  totalAssessments: number;     // Jumlah penilaian di stage ini
}

interface RatingDistribution {
  rating: number;               // 1-5
  label: string;                // "Belum terlihat", "Mulai berkembang", etc.
  count: number;                // Jumlah peserta dengan rating ini
  percentage: number;           // Persentase dari total
  color: string;                // Warna untuk chart
}

interface ActivityItem {
  id: string;
  type: 'session_created' | 'session_started' | 'session_completed' | 'report_sent' | 'participant_added' | 'stage_completed';
  title: string;
  description: string;
  timestamp: string;            // ISO date string
  icon: string;                 // Lucide icon name
  color: string;                // Tailwind color class
}

interface RecentSession {
  id: string;
  name: string;
  programName: string;
  date: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  participantCount: number;
  completionRate: number;       // 0-100 percentage
}
```

#### Chart Color Palette

```typescript
// shared/constants/charts.ts

export const CHART_COLORS = {
  rating1: '#EF4444',  // Red - Belum terlihat
  rating2: '#F97316',  // Orange - Mulai berkembang
  rating3: '#EAB308',  // Yellow - Cukup baik
  rating4: '#22C55E',  // Green - Sangat baik
  rating5: '#3B82F6',  // Blue - Luar biasa
};

export const CHART_PALETTE = [
  '#5B2C8D',  // Primary (ungu)
  '#7B4DB5',  // Primary light
  '#F5A623',  // Accent (emas)
  '#3B82F6',  // Blue
  '#22C55E',  // Green
  '#EF4444',  // Red
  '#F97316',  // Orange
  '#06B6D4',  // Cyan
];
```

### 2.2 Layout Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  PageHeader (Reusable)                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Title + Subtitle                    [Actions] [Layout] │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  StatCard  │  StatCard  │  StatCard  │  StatCard        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────┐  ┌──────────────────────┐    │
│  │                              │  │                      │    │
│  │  BarChartAverage             │  │  PieChartDistribution│    │
│  │  (Rata-rata nilai/stage)     │  │  (Distribusi bintang)│    │
│  │                              │  │                      │    │
│  └──────────────────────────────┘  └──────────────────────┘    │
│                                                                 │
│  ┌──────────────────────────────┐  ┌──────────────────────┐    │
│  │                              │  │                      │    │
│  │  ActivityFeed                │  │  RecentSessions      │    │
│  │  (Aktivitas terbaru)         │  │  (Sesi terbaru)      │    │
│  │                              │  │                      │    │
│  └──────────────────────────────┘  └──────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Layout Switch Modes

| Mode | Description | Implementation |
|------|-------------|----------------|
| **Full Width (Default)** | All sections span full width, charts in 2-column grid | `grid grid-cols-1 lg:grid-cols-2` |
| **Sidebar Active** | Main content 2/3, sidebar stats 1/3 | `grid grid-cols-1 lg:grid-cols-3` + sidebar component |
| **Mobile** | All sections stack vertically | `grid grid-cols-1` with responsive breakpoints |

#### Layout Switch Component

```typescript
interface DashboardLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;     // Optional sidebar content
  defaultMode?: 'full' | 'sidebar';
}

// Layout modes stored in localStorage
// Toggle button: [Full Width] [Sidebar] (icon buttons, mobile-friendly)
// Collapse/Expand: Sidebar slides in/out with animation
```

---

## 3. Granular Target Component Map

### 3.1 New Components

| # | File Path | Type | Description | Dependencies |
|---|-----------|------|-------------|--------------|
| 1 | `src/shared/components/ui/PageHeader.tsx` | CREATE | Reusable page header with title, subtitle, and action buttons | `cn` utility |
| 2 | `src/shared/components/ui/StatCard.tsx` | CREATE | Stat card with icon, value, label, and optional change indicator | `cn`, `lucide-react` |
| 3 | `src/shared/components/charts/BarChartAverage.tsx` | CREATE | Bar chart showing average rating per stage | `recharts` |
| 4 | `src/shared/components/charts/PieChartDistribution.tsx` | CREATE | Pie chart showing rating distribution | `recharts` |
| 5 | `src/shared/components/data/ActivityFeed.tsx` | CREATE | Activity feed list with icons and timestamps | `date-fns`, `lucide-react` |
| 6 | `src/shared/components/data/RecentSessions.tsx` | CREATE | Recent sessions table with status badges | `Badge`, `date-fns` |
| 7 | `src/shared/components/layout/DashboardLayout.tsx` | CREATE | Layout switcher (full-width/sidebar toggle) | `cn`, `lucide-react` |
| 8 | `src/shared/constants/charts.ts` | CREATE | Chart color palette constants | None |
| 9 | `src/features/admin/mock/dashboard.ts` | CREATE | Mock data for all dashboard components | None |

### 3.2 Modified Components

| # | File Path | Type | Changes | Target Lines |
|---|-----------|------|---------|--------------|
| 10 | `src/features/admin/pages/DashboardPage.tsx` | REWRITE | Complete rewrite with new components and mock data | All (1-80) |
| 11 | `src/features/admin/pages/ProgramsPage.tsx` | UPDATE | Replace inline header with `PageHeader` | Lines 103-111 |
| 12 | `src/features/admin/pages/SessionsPage.tsx` | UPDATE | Replace inline header with `PageHeader` | Lines 99-108 |
| 13 | `src/features/admin/pages/ContentPage.tsx` | UPDATE | Replace inline header with `PageHeader` | Lines 19-25 |
| 14 | `src/features/admin/pages/UsersPage.tsx` | UPDATE | Replace inline header with `PageHeader` | Lines 112-119 |
| 15 | `src/features/admin/pages/FramesPage.tsx` | UPDATE | Replace inline header with `PageHeader` | Lines 36-42 |
| 16 | `src/features/admin/pages/StoriesPage.tsx` | UPDATE | Replace inline header with `PageHeader` + add `space-y-6` wrapper | Lines 41-48 |
| 17 | `src/features/admin/pages/ProgramDetailPage.tsx` | UPDATE | Replace inline header with `PageHeader` | Lines 77-86 |
| 18 | `src/features/admin/pages/SessionDetailPage.tsx` | UPDATE | Replace inline header with `PageHeader` | Lines 37-46 |
| 19 | `src/features/fasilitator/pages/DashboardPage.tsx` | UPDATE | Replace inline header with `PageHeader` + add `space-y-6` wrapper | Lines 12-13 |
| 20 | `src/features/parent/pages/DashboardPage.tsx` | UPDATE | Replace inline header with `PageHeader` + add `space-y-6` wrapper | Lines 12-13 |

### 3.3 Dependency Installation

| # | Package | Version | Command | Purpose |
|---|---------|---------|---------|---------|
| 1 | `recharts` | ^3.9.1 | `npm install recharts` | Chart library |
| 2 | `react-is` | (match react) | `npm install react-is` | Recharts peer dependency |

---

## 4. Component Specifications

### 4.1 PageHeader Component

```typescript
// src/shared/components/ui/PageHeader.tsx

interface PageHeaderProps {
  title: string;                    // Judul halaman
  subtitle?: string;                // Deskripsi singkat
  actions?: React.ReactNode;        // Tombol aksi di sebelah kanan
  breadcrumbs?: Array<{             // Optional breadcrumbs
    label: string;
    href?: string;
  }>;
  className?: string;
}

// Rendering:
// - title: text-2xl font-bold text-gray-900
// - subtitle: text-sm text-gray-500 mt-1
// - actions: flex items-center gap-2
// - Wrapper: flex items-center justify-between mb-6
```

### 4.2 StatCard Component

```typescript
// src/shared/components/ui/StatCard.tsx

interface StatCardProps {
  label: string;                    // "Total Programs"
  value: string | number;           // "3" atau 42
  icon: React.ReactNode;            // <FolderOpen className="w-6 h-6" />
  change?: {                        // Optional change indicator
    value: string;                  // "+5" atau "+10%"
    type: 'increase' | 'decrease' | 'neutral';
  };
  href?: string;                    // Optional link
  accent: string;                   // Tailwind class "bg-primary-100 text-primary"
  className?: string;
}

// Rendering:
// - Card wrapper with hover effect
// - Icon in colored circle (accent)
// - Value: text-3xl font-bold text-gray-900
// - Label: text-sm text-gray-500
// - Change: text-sm green/red/gray with arrow icon
```

### 4.3 BarChartAverage Component

```typescript
// src/shared/components/charts/BarChartAverage.tsx

interface BarChartAverageProps {
  data: StageAverage[];             // Array of stage averages
  title: string;                    // "Rata-rata Nilai per Stage"
  className?: string;
}

// Rendering:
// - Card wrapper with title
// - ResponsiveContainer (width="100%" height={300})
// - BarChart with CartesianGrid, XAxis, YAxis, Tooltip
// - Bar with gradient fill using primary color
// - Custom tooltip showing stage name + average rating
```

### 4.4 PieChartDistribution Component

```typescript
// src/shared/components/charts/PieChartDistribution.tsx

interface PieChartDistributionProps {
  data: RatingDistribution[];       // Array of rating distributions
  title: string;                    // "Distribusi Penilaian"
  className?: string;
}

// Rendering:
// - Card wrapper with title
// - ResponsiveContainer (width="100%" height={300})
// - PieChart with Pie, Cell, Tooltip, Legend
// - Custom colors from CHART_COLORS
// - Custom tooltip showing rating label + count + percentage
// - Legend with colored dots
```

### 4.5 ActivityFeed Component

```typescript
// src/shared/components/data/ActivityFeed.tsx

interface ActivityFeedProps {
  activities: ActivityItem[];       // Array of activities
  title: string;                    // "Aktivitas Terbaru"
  maxItems?: number;                // Default: 5
  className?: string;
}

// Rendering:
// - Card wrapper with title + "Lihat Semua" link
// - List of activity items with:
//   - Icon (colored circle)
//   - Title + description
//   - Timestamp (relative: "2 jam lalu")
// - Divider between items
```

### 4.6 DashboardLayout Component

```typescript
// src/shared/components/layout/DashboardLayout.tsx

interface DashboardLayoutProps {
  children: React.ReactNode;        // Main content
  sidebar?: React.ReactNode;        // Optional sidebar
  defaultMode?: 'full' | 'sidebar';
}

// State:
// - mode: 'full' | 'sidebar' (stored in localStorage)
// - sidebarOpen: boolean (for collapse/expand)

// Rendering:
// - Toggle buttons: [Full Width] [Sidebar] (icon buttons)
// - Full mode: children in grid-cols-1 lg:grid-cols-2
// - Sidebar mode: children 2/3 + sidebar 1/3
// - Mobile: All stack vertically, sidebar becomes bottom sheet
// - Collapse/Expand: Sidebar slides in/out with transition
```

---

## 5. Mock Data Specification

### 5.1 Dashboard Mock Data

```typescript
// src/features/admin/mock/dashboard.ts

export const dashboardStats: DashboardStats = {
  totalPrograms: 5,
  activeSessions: 3,
  totalParticipants: 127,
  reportsSent: 89,
  reportsTotal: 127,
};

export const stageAverages: StageAverage[] = [
  { stageName: 'Sapa Profesi', averageRating: 4.2, totalAssessments: 45 },
  { stageName: 'Games Edukasi', averageRating: 3.8, totalAssessments: 42 },
  { stageName: 'Modern vs Tradisional', averageRating: 4.5, totalAssessments: 40 },
  { stageName: 'Refleksi', averageRating: 4.0, totalAssessments: 38 },
];

export const ratingDistribution: RatingDistribution[] = [
  { rating: 1, label: 'Belum terlihat', count: 5, percentage: 3.3, color: '#EF4444' },
  { rating: 2, label: 'Mulai berkembang', count: 12, percentage: 8.0, color: '#F97316' },
  { rating: 3, label: 'Cukup baik', count: 35, percentage: 23.3, color: '#EAB308' },
  { rating: 4, label: 'Sangat baik', count: 58, percentage: 38.7, color: '#22C55E' },
  { rating: 5, label: 'Luar biasa', count: 40, percentage: 26.7, color: '#3B82F6' },
];

export const recentActivities: ActivityItem[] = [
  {
    id: 'a-1',
    type: 'session_started',
    title: 'Sesi Dimulai',
    description: 'Kunjungan SD Matahari telah dimulai',
    timestamp: '2026-07-04T08:00:00+07:00',
    icon: 'Play',
    color: 'text-green-600 bg-green-100',
  },
  {
    id: 'a-2',
    type: 'participant_added',
    title: 'Peserta Ditambahkan',
    description: '15 peserta baru ditambahkan ke Kelompok Merah',
    timestamp: '2026-07-04T07:30:00+07:00',
    icon: 'Users',
    color: 'text-blue-600 bg-blue-100',
  },
  {
    id: 'a-3',
    type: 'report_sent',
    title: 'Raport Dikirim',
    description: '8 raport berhasil dikirim ke orang tua',
    timestamp: '2026-07-03T16:00:00+07:00',
    icon: 'FileText',
    color: 'text-purple-600 bg-purple-100',
  },
  {
    id: 'a-4',
    type: 'stage_completed',
    title: 'Stage Selesai',
    description: 'Kelompok Biru menyelesaikan Sapa Profesi',
    timestamp: '2026-07-04T09:15:00+07:00',
    icon: 'CheckCircle',
    color: 'text-emerald-600 bg-emerald-100',
  },
  {
    id: 'a-5',
    type: 'session_created',
    title: 'Sesi Baru Dibuat',
    description: 'Sesi "Edukasi Pertanian" dijadwalkan 5 Juli',
    timestamp: '2026-07-04T10:00:00+07:00',
    icon: 'Calendar',
    color: 'text-orange-600 bg-orange-100',
  },
];

export const recentSessions: RecentSession[] = [
  {
    id: 's-1',
    name: 'Kunjungan SD Matahari',
    programName: 'Belajar Bertani',
    date: '2026-07-04',
    status: 'ACTIVE',
    participantCount: 45,
    completionRate: 65,
  },
  {
    id: 's-2',
    name: 'Trip TK Ceria',
    programName: 'Mengenal Laut',
    date: '2026-07-03',
    status: 'COMPLETED',
    participantCount: 32,
    completionRate: 100,
  },
  {
    id: 's-3',
    name: 'Kelas Inspirasi SDN 5',
    programName: 'Petualangan Hutan',
    date: '2026-07-05',
    status: 'DRAFT',
    participantCount: 50,
    completionRate: 0,
  },
];
```

---

## 6. Implementation Phases

### Phase 1: Foundation (Dependencies + Core Components)

| Step | Task | Files |
|------|------|-------|
| 1.1 | Install recharts + react-is | `package.json` |
| 1.2 | Create chart constants | `src/shared/constants/charts.ts` |
| 1.3 | Create PageHeader component | `src/shared/components/ui/PageHeader.tsx` |
| 1.4 | Create StatCard component | `src/shared/components/ui/StatCard.tsx` |
| 1.5 | Create mock data | `src/features/admin/mock/dashboard.ts` |

### Phase 2: Chart Components

| Step | Task | Files |
|------|------|-------|
| 2.1 | Create BarChartAverage | `src/shared/components/charts/BarChartAverage.tsx` |
| 2.2 | Create PieChartDistribution | `src/shared/components/charts/PieChartDistribution.tsx` |
| 2.3 | Create ActivityFeed | `src/shared/components/data/ActivityFeed.tsx` |
| 2.4 | Create RecentSessions | `src/shared/components/data/RecentSessions.tsx` |

### Phase 3: Layout System

| Step | Task | Files |
|------|------|-------|
| 3.1 | Create DashboardLayout with switcher | `src/shared/components/layout/DashboardLayout.tsx` |

### Phase 4: Admin Dashboard Rewrite

| Step | Task | Files |
|------|------|-------|
| 4.1 | Rewrite DashboardPage with all new components | `src/features/admin/pages/DashboardPage.tsx` |

### Phase 5: UI Consistency Pass

| Step | Task | Files |
|------|------|-------|
| 5.1 | Update ProgramsPage with PageHeader | `src/features/admin/pages/ProgramsPage.tsx` |
| 5.2 | Update SessionsPage with PageHeader | `src/features/admin/pages/SessionsPage.tsx` |
| 5.3 | Update ContentPage with PageHeader | `src/features/admin/pages/ContentPage.tsx` |
| 5.4 | Update UsersPage with PageHeader | `src/features/admin/pages/UsersPage.tsx` |
| 5.5 | Update FramesPage with PageHeader | `src/features/admin/pages/FramesPage.tsx` |
| 5.6 | Update StoriesPage with PageHeader + wrapper | `src/features/admin/pages/StoriesPage.tsx` |
| 5.7 | Update ProgramDetailPage with PageHeader | `src/features/admin/pages/ProgramDetailPage.tsx` |
| 5.8 | Update SessionDetailPage with PageHeader | `src/features/admin/pages/SessionDetailPage.tsx` |
| 5.9 | Update Fasilitator DashboardPage | `src/features/fasilitator/pages/DashboardPage.tsx` |
| 5.10 | Update Parent DashboardPage | `src/features/parent/pages/DashboardPage.tsx` |

---

## 7. System & Logic Flow Diagrams

### 7.1 Component Hierarchy

```
App
└── AdminLayout
    └── DashboardPage
        ├── PageHeader
        │   ├── Title + Subtitle
        │   └── Actions (Button)
        ├── DashboardLayout
        │   ├── LayoutToggle (Full/Sidebar switch)
        │   ├── MainContent
        │   │   ├── StatCards (grid 4 cols)
        │   │   │   ├── StatCard (Total Programs)
        │   │   │   ├── StatCard (Active Sessions)
        │   │   │   ├── StatCard (Total Participants)
        │   │   │   └── StatCard (Reports Sent)
        │   │   ├── ChartsRow (grid 2 cols)
        │   │   │   ├── BarChartAverage
        │   │   │   └── PieChartDistribution
        │   │   └── BottomRow (grid 2 cols)
        │   │       ├── ActivityFeed
        │   │       └── RecentSessions
        │   └── Sidebar (optional)
        │       └── QuickStats
```

### 7.2 Layout Switch Flow

```
User clicks layout toggle
        ↓
DashboardLayout.setState({ mode })
        ↓
Save to localStorage('kidversa-dashboard-layout')
        ↓
Re-render with new grid classes:
  - 'full': grid-cols-1 lg:grid-cols-2
  - 'sidebar': grid-cols-1 lg:grid-cols-3
        ↓
Sidebar slides in/out with transition
        ↓
Mobile: Sidebar becomes bottom sheet (full width)
```

### 7.3 Data Flow

```
DashboardPage mounts
        ↓
Import mock data from features/admin/mock/dashboard
        ↓
Pass data to child components:
  - dashboardStats → StatCard components
  - stageAverages → BarChartAverage
  - ratingDistribution → PieChartDistribution
  - recentActivities → ActivityFeed
  - recentSessions → RecentSessions
        ↓
Components render with data
        ↓
Charts auto-responsive via ResponsiveContainer
```

---

## 8. Risk Mitigation & Edge Cases

### 8.1 Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Recharts incompatible with React 19 | Build fails | Check recharts peer dependencies before install; use `--legacy-peer-deps` if needed |
| Chart rendering issues on mobile | Poor UX | Use `ResponsiveContainer` for all charts; test on 320px width |
| localStorage layout preference sync | Layout state lost | Implement fallback to default mode if localStorage corrupt |
| Mock data structure changes | Components break | Define TypeScript interfaces; use strict typing |
| Performance with large datasets | Slow rendering | Limit mock data to reasonable sizes; implement virtual scrolling if needed |

### 8.2 Edge Cases

| Edge Case | Handling |
|-----------|----------|
| No data available | Show empty state with illustration (reuse `EmptyState` component) |
| Very long activity titles | Truncate with ellipsis after 2 lines |
| Chart with single data point | Show message "Belum cukup data untuk chart" |
| Mobile landscape orientation | Charts maintain aspect ratio via ResponsiveContainer |
| Dark mode (future) | Use CSS variables for chart colors; design with dark mode in mind |
| User without permission | Dashboard shows limited stats based on role |

### 8.3 Performance Considerations

| Optimization | Implementation |
|--------------|----------------|
| Lazy load charts | Use React.lazy for chart components |
| Memoize chart data | Use useMemo for processed data |
| Debounce layout switch | 100ms debounce on layout toggle |
| Image optimization | Use lazy loading for any images in activity feed |

---

## 9. Testing Checklist

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Admin Dashboard loads without errors | All components render correctly |
| 2 | Stat cards display correct values | Values match mock data |
| 3 | Bar chart renders with data | Bars visible, tooltips work |
| 4 | Pie chart renders with data | Slices visible, legend works |
| 5 | Activity feed shows 5 items | Items rendered with correct icons |
| 6 | Recent sessions table works | Status badges correct, completion bar visible |
| 7 | Layout switch toggles correctly | Full width ↔ Sidebar mode |
| 8 | Layout preference persists | Refresh page, layout stays same |
| 9 | Mobile responsive | All components stack vertically on small screens |
| 10 | All admin pages have consistent PageHeader | Title, subtitle, actions aligned |
| 11 | Fasilitator dashboard consistent | Uses PageHeader, space-y-6 wrapper |
| 12 | Parent dashboard consistent | Uses PageHeader, space-y-6 wrapper |

---

## 10. Success Criteria

| Criteria | Target |
|----------|--------|
| Admin Dashboard | Matches FSD §22.1 specification |
| Chart rendering | Both Bar and Pie charts display correctly |
| Layout switch | Works on mobile and desktop |
| UI Consistency | All admin pages use PageHeader |
| No build errors | `npm run build` passes |
| No TypeScript errors | `tsc --noEmit` passes |
| Bundle size increase | <50KB added (recharts tree-shaken) |

---

*Plan generated by Plan-Builder | Kidversa Edutourism | 2026-07-04*
*Reference: BRD v3.0, ERD v1.0, FSD v1.0*

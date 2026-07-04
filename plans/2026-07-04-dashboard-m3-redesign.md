# Dashboard Redesign: Material Design 3 Color System + Template Visual Style

## Document Metadata

| Field | Value |
|-------|-------|
| **Title** | Admin Dashboard Redesign — M3 Color System + Clean Visual Style |
| **Timestamp** | 2026-07-04T07:29:00+07:00 |
| **Status** | `EXECUTED` |
| **Reference Template** | `plans/templates/dashboard.html` (Coursue Dashboard) |
| **Color System** | Material Design 3 (M3) |

---

## 1. Executive Summary

Redesign admin dashboard Kidversa dengan mengadopsi:
1. **Material Design 3 Color System** — 29 color roles dari brand colors `#5B2C8D` (primary) dan `#F5A623` (tertiary/emas)
2. **Visual Style Template** — Layout 3-kolom, sidebar putih, greeting banner, category cards, horizontal scroll cards, clean table, donut stat, team list
3. **Greeting + Header** — Header bar dengan search, notification, user profile; greeting banner personal

### Prinsip M3 yang Diterapkan

- **Primary hanya untuk aksen** — Tidak dipakai untuk background sidebar/card
- **Surface untuk background** — Sidebar, card, container pakai surface colors
- **On-surface untuk teks** — Heading dan body text
- **Outline untuk border** — Card border, divider
- **Primary container untuk badge/tag** — Status indicators
- **Tertiary untuk accent emas** — Highlight angka penting

---

## 2. M3 Color Scheme

### 2.1 Brand Colors → M3 Mapping

```
Brand Primary: #5B2C8D (Ungu tua)
Brand Accent:  #F5A623 (Emas)

M3 Tonal Palette Generation:
  Primary tone 40 = #5B2C8D (brand color)
  Primary tone 90 = #F3EEFA (light container)
  Primary tone 10 = #21005D (dark text on container)
  
  Tertiary tone 40 = #7D5700 (darkened emas)
  Tertiary tone 90 = #FFDEA1 (light container)
  Tertiary tone 10 = #261900 (dark text on container)
```

### 2.2 Complete Color Roles (29 tokens)

#### Primary Family
| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#5B2C8D` | Tombol utama, nav active, FAB, icon aksen |
| `on-primary` | `#FFFFFF` | Teks/icon di atas primary |
| `primary-container` | `#F3EEFA` | Badge, tag, hover state |
| `on-primary-container` | `#21005D` | Teks di atas primary-container |

#### Secondary Family
| Token | Hex | Usage |
|-------|-----|-------|
| `secondary` | `#625B71` | Tombol sekunder, filter chip |
| `on-secondary` | `#FFFFFF` | Teks di atas secondary |
| `secondary-container` | `#E8DEF8` | Container sekunder |
| `on-secondary-container` | `#1D192B` | Teks di secondary-container |

#### Tertiary Family (Brand Emas)
| Token | Hex | Usage |
|-------|-----|-------|
| `tertiary` | `#7D5700` | Accent emas, highlight |
| `on-tertiary` | `#FFFFFF` | Teks di atas tertiary |
| `tertiary-container` | `#FFDEA1` | Badge emas, premium |
| `on-tertiary-container` | `#261900` | Teks di tertiary-container |

#### Neutral Family
| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#FFFBFE` | Latar belakang app |
| `on-background` | `#1C1B1F` | Teks utama di background |
| `surface` | `#FFFBFE` | Latar kartu, sheet |
| `on-surface` | `#1C1B1F` | Heading, body text |
| `surface-variant` | `#E7E0EC` | Container rendah |
| `on-surface-variant` | `#49454F` | Label, helper text |
| `inverse-surface` | `#313033` | Snackbar, tooltip |
| `inverse-on-surface` | `#F4EFF4` | Teks di inverse surface |
| `inverse-primary` | `#D0BCFF` | Primary di inverse surface |

#### Outline Family
| Token | Hex | Usage |
|-------|-----|-------|
| `outline` | `#79747E` | Border butuh kontras jelas |
| `outline-variant` | `#CAC4D0` | Divider, border dekoratif |

#### Error Family
| Token | Hex | Usage |
|-------|-----|-------|
| `error` | `#B3261E` | State error |
| `on-error` | `#FFFFFF` | Teks di atas error |
| `error-container` | `#F9DEDC` | Container error |
| `on-error-container` | `#410E0B` | Teks di error-container |

#### Surface Hierarchy (Elevation)
| Token | Hex | Usage |
|-------|-----|-------|
| `surface-dim` | `#DED8E1` | Surface redup |
| `surface-bright` | `#FFFBFE` | Surface terang |
| `surface-container-lowest` | `#FFFFFF` | Elevation terendah |
| `surface-container-low` | `#F7F2FA` | Sidebar, container rendah |
| `surface-container` | `#F3EDF7` | Container default |
| `surface-container-high` | `#ECE6F0` | Container tinggi |
| `surface-container-highest` | `#E6E0E9` | Elevation tertinggi |

---

## 3. Layout Architecture

### 3.1 New Layout Structure

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR (surface-container-low) │  HEADER (surface)             │
│                                  │  ┌──────────────────────────┐ │
│ 🟣 Kidversa                      │  │ 🔍 Search  📹 🔔 👤 Nama │ │
│ ────────                         │  ├──────────────────────────┤ │
│ OVERVIEW                         │  │ GREETING BANNER           │ │
│ ● Dashboard                      │  │ (primary gradient)        │ │
│ ○ Programs                       │  │ "Selamat Pagi, Admin! 🔥" │ │
│ ○ Sessions                       │  ├──────────────────────────┤ │
│                                  │  │ CATEGORY CARDS (3 cards)  │ │
│ PROGRAM                          │  │ ┌────┐ ┌────┐ ┌────┐     │ │
│ ○ Programs                       │  │ │🟣  │ │🔵  │ │🟢  │     │ │
│ ○ Sessions                       │  │ └────┘ └────┘ └────┘     │ │
│                                  │  ├──────────────────────────┤ │
│ CONTENT                          │  │ SESI TERBARU (carousel)  │ │
│ ○ Content Mgr                    │  │ ┌────┐ ┌────┐ ┌────┐     │ │
│ ○ Frame Mgr                      │  │ └────┘ └────┘ └────┘     │ │
│                                  │  ├──────────────────────────┤ │
│ SETTINGS                         │  │ TABEL    │ STATISTIK     │ │
│ ○ Users                          │  │ (8 col)  │ (4 col)       │ │
│                                  │  │          │ Donut 🟣      │ │
│ ────────                         │  │          │ Bar Chart     │ │
│ ⚙ Setting                        │  │          │ Tim List      │ │
│ 🚪 Logout                         │  └──────────┴───────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Grid System

| Area | Grid | Width |
|------|------|-------|
| Sidebar | Fixed | `w-64` (256px) |
| Header | Flex | `flex-1` |
| Main Content | `grid-cols-12` | Full width |
| Tabel Sesi | `col-span-8` | 66% |
| Right Sidebar | `col-span-4` | 33% |

### 3.3 Responsive Behavior

| Breakpoint | Sidebar | Main | Right Sidebar |
|------------|---------|------|---------------|
| Desktop (≥1280px) | Fixed w-64 | Full | Full col-span-4 |
| Tablet (≥768px) | Collapsible w-20 | Full | Stacked below |
| Mobile (<768px) | Hidden (drawer) | Full | Stacked below |

---

## 4. Component Specifications

### 4.1 AdminLayout (Total Rewrite)

**File**: `src/shared/layouts/AdminLayout.tsx`

**Structure**:
```tsx
<div className="flex h-screen bg-background">
  {/* Sidebar — surface-container-low */}
  <aside className="w-64 bg-surface-container-low border-r border-outline-variant flex flex-col">
    {/* Logo */}
    {/* Navigation — primary-container for active */}
    {/* Footer — Setting + Logout */}
  </aside>

  {/* Main Area */}
  <div className="flex-1 flex flex-col min-w-0">
    {/* Header — surface */}
    <AppHeader />
    
    {/* Scrollable Content */}
    <main className="flex-1 overflow-y-auto">
      <div className="p-6 lg:p-8">
        <Outlet />
      </div>
    </main>
  </div>
</div>
```

**Sidebar Styling**:
- Background: `bg-surface-container-low` (#F7F2FA)
- Border: `border-r border-outline-variant` (#CAC4D0)
- Active nav: `bg-primary-container text-on-primary-container`
- Inactive nav: `text-on-surface-variant hover:bg-surface-container`
- Section labels: `text-[10px] font-bold text-on-surface-variant uppercase tracking-widest`
- Logout: `text-error hover:bg-error-container`

### 4.2 AppHeader (New Component)

**File**: `src/shared/components/layout/AppHeader.tsx`

**Structure**:
```tsx
<header className="h-20 flex-shrink-0 flex items-center justify-between px-8 bg-surface border-b border-outline-variant">
  {/* Search */}
  <div className="relative w-full max-w-xl">
    <SearchIcon />
    <input 
      className="w-full bg-surface-container-low border-0 rounded-2xl py-3 pl-12 pr-4 text-sm 
                 text-on-surface placeholder-on-surface-variant
                 focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
    />
  </div>

  {/* Right Actions */}
  <div className="flex items-center gap-4">
    <IconButton icon={<VideoIcon />} />
    <IconButton icon={<BellIcon />} badge />
    <UserInfo avatar={user.avatar} name={user.name} />
  </div>
</header>
```

**Styling**:
- Background: `bg-surface` (#FFFBFE)
- Search input: `bg-surface-container-low rounded-2xl shadow-sm`
- Icon buttons: `w-10 h-10 rounded-full bg-surface shadow-sm`
- Notification badge: `w-2 h-2 bg-error rounded-full`
- User avatar: `w-10 h-10 rounded-full border border-outline-variant`

### 4.3 GreetingBanner (New Component)

**File**: `src/shared/components/ui/GreetingBanner.tsx`

**Structure**:
```tsx
<div className="relative rounded-[2rem] overflow-hidden bg-gradient-to-r from-primary to-primary-light p-9 text-white shadow-lg">
  <div className="relative z-10 max-w-lg">
    <p className="text-[11px] font-bold tracking-[0.15em] uppercase opacity-80 mb-2">
      EDUTOURISM
    </p>
    <h1 className="text-3xl xl:text-4xl font-bold leading-tight mb-7">
      {greeting}, {user.name}! 🔥
    </h1>
    <p className="text-sm opacity-90 mb-7">
      {motivationalMessage}
    </p>
    <button className="bg-surface-container-high hover:bg-surface-container-highest 
                       transition-colors text-on-surface pl-6 pr-2 py-2 rounded-full 
                       flex items-center gap-3 text-sm font-semibold">
      Lihat Program
      <span className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center">
        <ArrowRight />
      </span>
    </button>
  </div>
  
  {/* Decorative sparkle */}
  <SparkleSvg />
  
  {/* Soft glow */}
  <div className="absolute -right-10 -bottom-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
</div>
```

**Greeting Logic**:
```typescript
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Selamat Pagi'
  if (hour < 17) return 'Selamat Siang'
  return 'Selamat Malam'
}
```

**Gradient**: `from-primary (#5B2C8D) to-primary-light (#7B4DB5)`

### 4.4 CategoryCard (New Component)

**File**: `src/shared/components/ui/CategoryCard.tsx`

**Structure**:
```tsx
<div className="bg-surface rounded-2xl p-4 flex items-center gap-4 shadow-sm">
  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0", iconBg)}>
    <Icon className="w-6 h-6" />
  </div>
  <div className="flex-1 min-w-0">
    <p className="text-xs text-on-surface-variant font-medium">{subtitle}</p>
    <p className="text-sm font-bold text-on-surface truncate">{title}</p>
  </div>
  <button className="text-on-surface-variant hover:text-on-surface">
    <ThreeDotIcon />
  </button>
</div>
```

**3 Cards**:
| Card | Icon | `iconBg` | Subtitle | Data |
|------|------|----------|----------|------|
| Program Aktif | FolderOpen | `bg-primary-container text-primary` | "Total program" | `dashboardStats.totalPrograms` |
| Sesi Aktif | Calendar | `bg-secondary-container text-secondary` | "Sesi berlangsung" | `dashboardStats.activeSessions` |
| Total Peserta | Users | `bg-tertiary-container text-tertiary` | "Peserta terdaftar" | `dashboardStats.totalParticipants` |

### 4.5 SessionCarousel (New Component)

**File**: `src/shared/components/data/SessionCarousel.tsx`

**Structure**:
```tsx
<div>
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-bold text-on-surface">Sesi Terbaru</h2>
    <CarouselNav current={page} total={totalPages} onPrev={prev} onNext={next} />
  </div>

  <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory">
    {sessions.map(session => (
      <SessionCard key={session.id} session={session} />
    ))}
  </div>
</div>
```

**SessionCard**:
```tsx
<div className="min-w-[260px] flex-1 bg-surface rounded-2xl p-3 shadow-sm group snap-start">
  <div className="relative rounded-xl overflow-hidden aspect-[16/10] mb-3">
    <img src={session.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
    <button className="heart-btn absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-surface/90 flex items-center justify-center">
      <HeartIcon />
    </button>
  </div>
  <Badge variant={session.status}>{session.statusLabel}</Badge>
  <h3 className="text-sm font-bold text-on-surface leading-snug mb-3 line-clamp-2">{session.name}</h3>
  <div className="flex items-center gap-2">
    <img src={session.mentorAvatar} className="w-6 h-6 rounded-full object-cover" />
    <p className="text-xs font-semibold text-on-surface">{session.mentorName}</p>
    <span className="text-[10px] text-on-surface-variant ml-auto">Fasilitator</span>
  </div>
</div>
```

**Carousel Navigation**:
```tsx
<div className="flex items-center gap-2">
  <button className="w-8 h-8 rounded-full border border-outline bg-surface/50 flex items-center justify-center">
    <ChevronLeft />
  </button>
  <span className="w-8 h-8 rounded-full bg-primary text-on-primary text-xs flex items-center justify-center font-bold">
    {current}
  </span>
  <button className="w-8 h-8 rounded-full bg-surface shadow-sm flex items-center justify-center text-primary">
    <ChevronRight />
  </button>
</div>
```

### 4.6 DonutStat (New Component)

**File**: `src/shared/components/charts/DonutStat.tsx`

**Structure**:
```tsx
<div className="bg-surface rounded-3xl p-6 shadow-sm">
  <h2 className="text-lg font-bold text-on-surface mb-6">Statistik</h2>
  
  <div className="flex flex-col items-center mb-6">
    <div className="relative w-28 h-28">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-primary-container)" strokeWidth="8" />
        {/* Progress circle */}
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-primary)" strokeWidth="8" 
                strokeDasharray="263.89" strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <img src={user.avatar} className="absolute inset-0 m-auto w-20 h-20 rounded-full object-cover border-4 border-surface shadow-sm" />
      <span className="absolute -top-0.5 -right-0.5 bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-surface">
        {percentage}%
      </span>
    </div>
    <h3 className="mt-5 text-lg font-bold text-on-surface">{greeting}, {userName}🔥</h3>
    <p className="text-xs text-on-surface-variant text-center mt-1 leading-relaxed">
      Semangat belajar hari ini!
    </p>
  </div>
</div>
```

**Donut Calculation**:
```typescript
const percentage = Math.round((reportsSent / reportsTotal) * 100)
const circumference = 2 * Math.PI * 42 // 263.89
const offset = circumference - (percentage / 100) * circumference
```

### 4.7 ActivityBarChart (New Component)

**File**: `src/shared/components/charts/ActivityBarChart.tsx`

**Structure** (CSS-based, no library):
```tsx
<div className="bg-surface rounded-3xl p-6 shadow-sm">
  <h2 className="text-lg font-bold text-on-surface mb-4">Aktivitas Mingguan</h2>
  
  <div className="bg-surface-container-low rounded-2xl p-4 relative">
    {/* Y-axis labels */}
    <div className="absolute left-4 top-4 bottom-10 flex flex-col justify-between text-[10px] text-on-surface-variant font-medium">
      <span>60</span><span>40</span><span>20</span><span>0</span>
    </div>
    
    {/* Bars */}
    <div className="ml-6 flex items-end justify-between h-32 gap-3 pt-2">
      {data.map(item => (
        <div key={item.week} className="flex-1 flex flex-col items-center gap-2">
          <div className="w-full bg-primary rounded-t-lg" style={{ height: `${(item.count / 60) * 100}%` }} />
          <span className="text-[10px] text-on-surface-variant">{item.week}</span>
        </div>
      ))}
    </div>
  </div>
</div>
```

### 4.8 TeamList (New Component)

**File**: `src/shared/components/data/TeamList.tsx`

**Structure**:
```tsx
<div className="bg-surface rounded-3xl p-6 shadow-sm">
  <h2 className="text-lg font-bold text-on-surface mb-4">Tim Eduwisata</h2>
  <ul className="space-y-4">
    {members.map(member => (
      <li className="flex items-center gap-3">
        <img src={member.avatar} className="w-11 h-11 rounded-full object-cover" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-on-surface truncate">{member.name}</p>
          <p className="text-xs text-on-surface-variant">{member.role}</p>
        </div>
        <button className="follow-btn flex items-center gap-1 px-3 py-1.5 rounded-full border border-outline text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary transition-colors">
          <PlusIcon /> Follow
        </button>
      </li>
    ))}
  </ul>
  <button className="w-full mt-5 py-3 rounded-xl bg-surface-container-low text-primary text-sm font-bold hover:bg-surface-container transition-colors">
    Lihat Semua
  </button>
</div>
```

### 4.9 DashboardPage (Total Rewrite)

**File**: `src/features/admin/pages/DashboardPage.tsx`

**Structure**:
```tsx
<div className="space-y-6">
  <GreetingBanner />
  
  {/* Category Cards */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <CategoryCard icon={<FolderOpen />} title={`${totalPrograms} Program`} subtitle="Total program" iconBg="bg-primary-container text-primary" />
    <CategoryCard icon={<Calendar />} title={`${activeSessions} Sesi`} subtitle="Sesi aktif" iconBg="bg-secondary-container text-secondary" />
    <CategoryCard icon={<Users />} title={`${totalParticipants} Peserta`} subtitle="Total peserta" iconBg="bg-tertiary-container text-tertiary" />
  </div>
  
  {/* Session Carousel */}
  <SessionCarousel sessions={sessionCards} />
  
  {/* Bottom Row */}
  <div className="grid grid-cols-12 gap-6">
    {/* Tabel Sesi */}
    <div className="col-span-12 lg:col-span-8 bg-surface rounded-3xl p-6 shadow-sm">
      <SessionTable sessions={recentSessions} />
    </div>
    
    {/* Right Sidebar */}
    <div className="col-span-12 lg:col-span-4 space-y-6">
      <DonutStat percentage={reportPercentage} user={user} />
      <ActivityBarChart data={weeklyActivity} />
      <TeamList members={teamMembers} />
    </div>
  </div>
</div>
```

---

## 5. File Changes

### 5.1 New Files

| # | File Path | Description |
|---|-----------|-------------|
| 1 | `src/shared/components/layout/AppHeader.tsx` | Header bar (search, bell, user) |
| 2 | `src/shared/components/ui/GreetingBanner.tsx` | Hero gradient banner + greeting |
| 3 | `src/shared/components/ui/CategoryCard.tsx` | Compact stat card M3 |
| 4 | `src/shared/components/data/SessionCarousel.tsx` | Horizontal scroll cards |
| 5 | `src/shared/components/charts/DonutStat.tsx` | SVG donut chart |
| 6 | `src/shared/components/charts/ActivityBarChart.tsx` | CSS bar chart |
| 7 | `src/shared/components/data/TeamList.tsx` | Team member list |

### 5.2 Modified Files

| # | File Path | Changes |
|---|-----------|---------|
| 1 | `src/index.css` | Add 29 M3 color tokens |
| 2 | `src/shared/layouts/AdminLayout.tsx` | Total rewrite — white sidebar + header |
| 3 | `src/features/admin/pages/DashboardPage.tsx` | Total rewrite — new layout |
| 4 | `src/features/admin/mock/dashboard.ts` | Add teamMembers, weeklyActivity, sessionCards |
| 5 | `src/shared/components/ui/Card.tsx` | Update to M3 (remove border, rounded-2xl) |
| 6 | `src/shared/components/ui/Badge.tsx` | Update to M3 (primary-container) |

### 5.3 Deleted Files

| # | File Path | Reason |
|---|-----------|--------|
| 1 | `src/shared/components/layout/DashboardLayout.tsx` | Layout integrated into AdminLayout |
| 2 | `src/shared/components/ui/StatCard.tsx` | Replaced by CategoryCard |
| 3 | `src/shared/components/data/ActivityFeed.tsx` | Replaced by SessionCarousel |
| 4 | `src/shared/components/data/RecentSessions.tsx` | Replaced by inline table |
| 5 | `src/shared/components/charts/BarChartAverage.tsx` | Replaced by ActivityBarChart |
| 6 | `src/shared/components/charts/PieChartDistribution.tsx` | Replaced by DonutStat |
| 7 | `src/shared/constants/charts.ts` | No longer needed |

---

## 6. Mock Data Updates

### New Data in `dashboard.ts`

```typescript
export const teamMembers = [
  { id: '1', name: 'Padhang Sanio', role: 'Koordinator', avatar: 'https://...', isFollowing: false },
  { id: '2', name: 'Zain Horizontal', role: 'Fasilitator', avatar: 'https://...', isFollowing: false },
  { id: '3', name: 'Leonardo Samsel', role: 'Fasilitator', avatar: 'https://...', isFollowing: false },
]

export const weeklyActivity = [
  { week: '10-16 Jul', count: 15 },
  { week: '17-20 Jul', count: 28 },
  { week: '21-30 Jul', count: 42 },
]

export const sessionCards = [
  {
    id: 's-1', name: 'Kunjungan SD Matahari', programName: 'Belajar Bertani',
    status: 'ACTIVE', statusLabel: 'Aktif',
    image: 'gradient-from-primary to-primary-light',
    mentor: 'Padhang Sanio', mentorAvatar: 'https://...', isSaved: false
  },
  {
    id: 's-2', name: 'Trip TK Ceria', programName: 'Mengenal Laut',
    status: 'COMPLETED', statusLabel: 'Selesai',
    image: 'gradient-from-secondary to-secondary-light',
    mentor: 'Zain Horizontal', mentorAvatar: 'https://...', isSaved: true
  },
  {
    id: 's-3', name: 'Kelas Inspirasi SDN 5', programName: 'Petualangan Hutan',
    status: 'DRAFT', statusLabel: 'Draf',
    image: 'gradient-from-tertiary to-tertiary-light',
    mentor: 'Leonardo Samsel', mentorAvatar: 'https://...', isSaved: false
  },
]
```

---

## 7. Implementation Phases

### Phase 1: M3 Foundation
| Step | Task | File |
|------|------|------|
| 1.1 | Add M3 color tokens to index.css | `src/index.css` |
| 1.2 | Update Card component to M3 | `src/shared/components/ui/Card.tsx` |
| 1.3 | Update Badge component to M3 | `src/shared/components/ui/Badge.tsx` |

### Phase 2: Layout Structure
| Step | Task | File |
|------|------|------|
| 2.1 | Create AppHeader component | `src/shared/components/layout/AppHeader.tsx` |
| 2.2 | Rewrite AdminLayout (white sidebar + header) | `src/shared/layouts/AdminLayout.tsx` |

### Phase 3: Dashboard Components
| Step | Task | File |
|------|------|------|
| 3.1 | Create GreetingBanner | `src/shared/components/ui/GreetingBanner.tsx` |
| 3.2 | Create CategoryCard | `src/shared/components/ui/CategoryCard.tsx` |
| 3.3 | Create SessionCarousel | `src/shared/components/data/SessionCarousel.tsx` |
| 3.4 | Create DonutStat | `src/shared/components/charts/DonutStat.tsx` |
| 3.5 | Create ActivityBarChart | `src/shared/components/charts/ActivityBarChart.tsx` |
| 3.6 | Create TeamList | `src/shared/components/data/TeamList.tsx` |

### Phase 4: Integration
| Step | Task | File |
|------|------|------|
| 4.1 | Update mock data | `src/features/admin/mock/dashboard.ts` |
| 4.2 | Rewrite DashboardPage | `src/features/admin/pages/DashboardPage.tsx` |

### Phase 5: Cleanup
| Step | Task | File |
|------|------|------|
| 5.1 | Delete old components | DashboardLayout, StatCard, ActivityFeed, RecentSessions, BarChartAverage, PieChartDistribution, charts.ts |
| 5.2 | Test build | `npm run build` |
| 5.3 | Visual testing | Manual review |

---

## 8. Validation Checklist

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Build passes | `npm run build` succeeds |
| 2 | M3 colors applied | Sidebar putih, nav active ungu, cards putih |
| 3 | Header renders | Search bar, bell, user profile visible |
| 4 | Greeting shows | Correct greeting based on time of day |
| 5 | Category cards | 3 cards with correct data |
| 6 | Session carousel | Horizontal scroll, prev/next works |
| 7 | Donut stat | SVG donut shows correct percentage |
| 8 | Bar chart | 3 bars with correct heights |
| 9 | Team list | 3 members with follow buttons |
| 10 | Follow toggle | Button changes to "Following" on click |
| 11 | Heart toggle | Heart fills on click |
| 12 | Mobile responsive | All sections stack vertically |
| 13 | Sidebar collapse | Works on tablet breakpoint |

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| M3 tokens conflict with existing Tailwind classes | Build errors | Use unique token names (e.g., `primary-container` not `primary-100`) |
| Sidebar height overflow | Content hidden | Use `flex-1 overflow-y-auto` on nav |
| Carousel scroll janky on mobile | Poor UX | Use `snap-x snap-mandatory` for smooth scroll |
| SVG donut animation performance | Slow render | Use `will-change: stroke-dashoffset` |
| Font rendering differences | Inconsistent look | Keep Poppins, test on multiple browsers |

---

*Plan generated by Kilo | Kidversa Edutourism | 2026-07-04*
*Reference: M3 Color System, plans/templates/dashboard.html*

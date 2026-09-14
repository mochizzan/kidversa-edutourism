# Mission Bank Simplify — Remove Category, Single Title, Topic-Scoped

**Date:** 2026-09-14
**Status:** Approved
**Scope:** Full-stack refactoring of Mission Bank feature

---

## Problem Statement

The Mission Bank feature has unnecessary complexity:
1. **`category` field** (HOME/PARENT/SCHOOL) adds UI tabs, stats, and filter logic without meaningful differentiation — missions are already scoped to Topics via `mission_bank_stages`
2. **Two title fields** (`title_child` + `title_parent`) — the parent-facing title adds form complexity; a single title suffices
3. **`description_parent` field** — not needed in the simplified form

Additionally, there's a PUT 400 error caused by validation mismatch between `MissionBankRequest.Category` (validate:"required") and the frontend update payload.

## Decisions

| Decision | Choice |
|---|---|
| Category removal | DROP COLUMN from DB, remove all references |
| Description removal | DROP COLUMN from DB, remove from form |
| Title fields | Merge `title_child` + `title_parent` → single `title` |
| Form design | Program → Judul Misi → Pilih Topik |
| Minimum active check | Removed — no minimum threshold |
| Mission grouping (reports) | By Topic (program_stage), not category |
| Heuristic fallback | Equal scoring, sort by title |
| Existing data | DROP COLUMN directly |

## Section 1: Database & Data Model

### New Migration: `000014_simplify_mission_banks.sql`

```sql
-- UP
ALTER TABLE mission_banks
  DROP COLUMN category,
  DROP COLUMN description_parent;

DROP INDEX idx_mission_banks_category ON mission_banks;

ALTER TABLE mission_banks
  CHANGE COLUMN title_child title VARCHAR(200) NOT NULL,
  DROP COLUMN title_parent;

-- DOWN
ALTER TABLE mission_banks
  ADD COLUMN category enum('HOME','PARENT','SCHOOL') NOT NULL DEFAULT 'HOME' AFTER program_id,
  ADD COLUMN title_parent varchar(200) NOT NULL DEFAULT '' AFTER title,
  ADD COLUMN description_parent text DEFAULT NULL AFTER title_parent,
  ADD KEY idx_mission_banks_category (category);
```

### Schema After Migration

```
mission_banks:
  id           CHAR(36) PK
  tenant_id    CHAR(36) FK → tenants
  program_id   CHAR(36) FK → programs (NOT NULL)
  title        VARCHAR(200) NOT NULL
  is_active    TINYINT(1) DEFAULT 1
  sort_order   INT DEFAULT 0
  created_at   DATETIME(3)
  updated_at   DATETIME(3)
  deleted_at   DATETIME(3)
```

### Entity (Go)

```go
type MissionBank struct {
    BaseModel
    TenantID        string   `json:"tenant_id"`
    ProgramID       string   `json:"program_id"`
    Title           string   `json:"title"`
    RelatedStageIDs []string `json:"related_stage_ids,omitempty" gorm:"-"`
    IsActive        bool    `json:"is_active"`
}
```

**Removed fields:** `Category`, `DescriptionParent`, `TitleChild`, `TitleParent`
**Added field:** `Title` (replaces the two title fields)

## Section 2: Backend Changes

### 2.1 Entity & Enums

| File | Change |
|---|---|
| `entity/enums.go` | Delete `MissionCategory` type + `MissionHome`, `MissionParent`, `MissionSchool` constants |
| `entity/content.go` | Update `MissionBank` struct: remove `Category`, `DescriptionParent`, `TitleChild`, `TitleParent`; add `Title` |

### 2.2 DTO

**File:** `dto/missionbank.go`

```go
type MissionBankRequest struct {
    TenantID        string   `json:"tenant_id" validate:"required"`
    ProgramID       string   `json:"program_id" validate:"required"`
    Title           string   `json:"title" validate:"required"`
    RelatedStageIDs []string `json:"related_stage_ids,omitempty"`
    IsActive        bool     `json:"is_active"`
}
```

**Changes:**
- Remove `Category` (was `validate:"required"`)
- Remove `TitleChild`, `TitleParent` → add `Title` (`validate:"required"`)
- Remove `DescriptionParent`
- Add `validate:"required"` to `ProgramID` (was `omitempty`)

### 2.3 Repository

**File:** `repository/missionbank.go`

```go
type MissionBankFilter struct {
    TenantID  string
    ProgramID string
    TopicID   string
    IsActive  *bool
    // Category → REMOVED
}
```

**File:** `persistence/missionbank_repo.go`

- Remove `Category` filter block in `List()` method
- All other methods unchanged (they don't reference Category)

### 2.4 Handlers

**File:** `handler/missionbank_handler.go` (Create)

```go
m := &entity.MissionBank{
    TenantID:        tenantID,
    ProgramID:       req.ProgramID,
    Title:           req.Title,
    RelatedStageIDs: req.RelatedStageIDs,
    IsActive:        req.IsActive,
}
```

**File:** `handler/missionbank_mgmt.go` (Update)

```go
m.ProgramID = req.ProgramID
m.Title = req.Title
m.RelatedStageIDs = req.RelatedStageIDs
m.IsActive = req.IsActive
```

### 2.5 Mission Recommender

**File:** `usecase/reports/mission_recommender.go`

**Heuristic changes:**
- Remove category-based scoring (`switch c.Category { ... }`)
- All candidates scored equally; stable sort by `TitleChild` (renamed to `Title`)
- Simple: return up to `MaxReportMissions` sorted alphabetically

**LLM prompt changes:**
- Candidate line format: `- id: xxx | judul: Gambar sapi kesukaanku`
- Remove `| kategori: HOME` from candidate list
- Update prompt templates in `prompts/report-missions-system.md` and `prompts/report-missions-user.md`

## Section 3: Frontend Changes

### 3.1 Types

**`types/enums.ts`** — Delete `MissionCategory` enum

**`types/entities.ts`** — Update `MissionBank`:
```typescript
export interface MissionBank {
  id: string
  program_id: string
  title: string
  related_stage_ids?: string[]
  is_active: boolean
  created_at: string
}
```

**`types/api.ts`** — Update `CreateMissionBankDTO`:
```typescript
export interface CreateMissionBankDTO {
  program_id: string
  title: string
  related_stage_ids?: string[]
}
```

### 3.2 Delete File

- `constants/missionCategory.ts` — Delete entirely (MISSION_CATEGORY_META, MISSION_CATEGORY_ORDER, MissionCategoryMeta, missionCategoryMeta)

### 3.3 Service Layer

**`services/missions.ts`:**
- `create()`: Send `{ program_id, title, related_stage_ids, is_active: true }`
- `update()`: Send `{ program_id, title, related_stage_ids }`
- Remove `normalizeMission()` `related_stage_ids_json` handling (if no longer needed)

### 3.4 Pages

**`pages/MissionFormPage.tsx`** — Simplified form:
```
[Program Select] → [Judul Misi Input] → [Topik Checkbox Grid] → [Submit]
```

Removed: Category select, second title input, description textarea

**`pages/MissionBankPage.tsx`** — Simplified list:
- Remove: `CATEGORY_TABS`, summary stats per kategori, `selectedCategory` state/filter
- Keep: Program filter, search, mission list, pagination

### 3.5 Components

**`components/MissionCard.tsx`:**
- Remove: `missionCategoryMeta` import, emoji display, `description_parent` details section
- Keep: `mission.title`, related_stage_ids badges, Aktif/Nonaktif badge, Edit/Toggle buttons

**`components/ReportMissionSelector.tsx`:**
- Remove: `MISSION_CATEGORY_ORDER` grouping, `MISSION_CATEGORY_META` display
- New: Group missions by `related_stage_ids` → show under each Topic heading
- Fallback: missions without related_stage_ids shown in "Tanpa Topik" group

### 3.6 Hooks

**`hooks/useMissionBank.ts`:**
- Remove: `selectedCategory` state, `stats` state, `loadStats()` function, category filter in `loadMissions()`, minimum active check in `handleToggleActive()`
- Keep: `selectedProgram`, `searchQuery`, `loadMissions()`, `stageMap`, `handleToggleActive()` (simplified)

### 3.7 Report Pages

**`pages/ReportReviewPage.tsx`:**
- Uses `ReportMissionSelector` — automatically fixed by component change
- `missions` state: items now have `title` instead of `title_child`/`title_parent`

**`hooks/useReportReview.ts`:**
- `mission.title` instead of `mission.title_child` in rapor generation

**`shared/templates/miniRaport` (if applicable):**
- Update rapor rendering to use `mission.title` instead of `mission.title_child`

## Section 4: Edge Cases & Error Handling

| # | Skenario | Penanganan |
|---|---|---|
| 1 | Create tanpa title | Backend: `validate:"required"` → 400. Frontend: guard + toast |
| 2 | Create tanpa program | Backend: `validate:"required"` → 400. Frontend: guard + disabled submit |
| 3 | Update misi yang sudah dipakai participant | Safe — FK tanpa CASCADE di participant_missions |
| 4 | Delete misi yang dipakai report | FK block → handler returns 409 "Misi masih digunakan" |
| 5 | Toggle active semua misi | Allowed — no minimum check |
| 6 | Topic tidak valid di related_stage_ids | FK block → repository returns error → 400 |
| 7 | Misi tanpa topik | Valid — not shown in ReportMissionSelector topic groups |
| 8 | LLM prompt tanpa kategori | Updated: `id + judul` only |
| 9 | Rapor rendering | Uses `title` instead of `title_child` |

### Error Contracts

| Error | HTTP | Code | When |
|---|---|---|---|
| Validation | 400 | `validation_error` | Missing required fields |
| Invalid body | 400 | `invalid_body` | Malformed JSON, invalid UUID |
| Not found | 404 | `not_found` | ID doesn't exist |
| Conflict | 409 | `conflict` | Delete mission used by reports |
| Internal | 500 | `internal_error` | DB error |

## File Change Summary

### Backend (8 files)
| File | Action |
|---|---|
| `entity/enums.go` | Remove MissionCategory type + constants |
| `entity/content.go` | Update MissionBank struct |
| `dto/missionbank.go` | Simplify MissionBankRequest |
| `repository/missionbank.go` | Remove Category from MissionBankFilter |
| `persistence/missionbank_repo.go` | Remove category filter in List |
| `handler/missionbank_handler.go` | Update Create to use Title |
| `handler/missionbank_mgmt.go` | Update Update to use Title |
| `usecase/reports/mission_recommender.go` | Simplify heuristic, update prompt refs |

### Frontend (10 files)
| File | Action |
|---|---|
| `types/enums.ts` | Remove MissionCategory enum |
| `types/entities.ts` | Simplify MissionBank interface |
| `types/api.ts` | Simplify CreateMissionBankDTO |
| `constants/missionCategory.ts` | DELETE |
| `services/missions.ts` | Update create/update payloads |
| `pages/MissionFormPage.tsx` | Simplify form |
| `pages/MissionBankPage.tsx` | Remove category tabs/stats |
| `components/MissionCard.tsx` | Remove category display |
| `components/ReportMissionSelector.tsx` | Group by topic |
| `hooks/useMissionBank.ts` | Remove category state/filter |

### Migration (1 file)
| File | Action |
|---|---|
| `migrations/000014_simplify_mission_banks.sql` | DROP category, description_parent; RENAME title_child→title; DROP title_parent |

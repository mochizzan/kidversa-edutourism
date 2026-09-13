# Assessment Card List & Session Start Error Fix

**Date:** 2026-09-14
**Status:** Approved
**Scope:** Frontend (fasilitator assessment UI) + Backend (session start validation verification)

---

## Problem Statement

### 1. Assessment UI: Tab-Based Workflow Is Slow

The current assessment page (`/fasilitator/groups/:groupId/children/:childId`) uses a horizontal button selector (tab pattern) where the facilitator must click each Kegiatan button to see and score it one at a time. This forces repetitive click→score→save→click cycles.

**Current flow:**
1. Click Kegiatan button → load that kegiatan's star rating + comment
2. Fill stars + comment
3. Click Save
4. Click next Kegiatan button → repeat

**Desired flow:**
1. Scroll down — all Kegiatan cards visible at once
2. Each card has: name, star rating, comment, save button
3. Fill and save each independently
4. Visual indicator (dot) shows which cards have unsaved changes

### 2. Session Start Error: Generic "Bad Request 400"

When clicking "Mulai Sesi" on a session with no groups, no participants, or no facilitators, the error message is a confusing generic "bad request 400" instead of clearly stating what's missing.

---

## Design: Assessment Card List

### Architecture

**Approach:** KegiatanCard as independent component (Approach B)

Each `KegiatanCard` is a self-contained component with its own local state for star rating, comment, and dirty tracking. The parent page fetches all assessments once and distributes them as initial values.

### Files Changed

| File | Change |
|------|--------|
| `frontend/src/features/fasilitator/pages/ChildAssessmentPage.tsx` | Refactor: remove tab selector, render card list |
| `frontend/src/features/fasilitator/hooks/useChildAssessment.ts` | Fetch all assessments at once, return map by substage ID |

### Files Created

| File | Purpose |
|------|---------|
| `frontend/src/features/fasilitator/components/KegiatanCard.tsx` | Independent card component with local state |

### Page Layout

```
┌─────────────────────────────────────┐
│  PageHeader: Penilaian Anak         │
│  Breadcrumbs: Dashboard → Anak      │
├─────────────────────────────────────┤
│  Child Info Card (unchanged)        │
│  [Avatar] Nama, Umur, Sekolah       │
│  [Ownership warning if not mine]    │
│  [Consent photo badge]              │
├─────────────────────────────────────┤
│  Kegiatan Card 1                    │
│  [●] (dot = unsaved changes)        │
│  📋 Kegiatan: [Nama Kegiatan]      │
│  ★★★★☆  4/5                         │
│  [Catatan textarea 3 rows]          │
│  [💾 Simpan]  ✓ Tersimpan!          │
├─────────────────────────────────────┤
│  Kegiatan Card 2                    │
│  (no dot = saved)                   │
│  📋 Kegiatan: [Nama Kegiatan]      │
│  ★★★☆☆  3/5                         │
│  [Catatan textarea 3 rows]          │
│  [💾 Simpan]  ✓ Tersimpan!          │
├─────────────────────────────────────┤
│  ... (scroll for more kegiatan)     │
├─────────────────────────────────────┤
│  [← Kembali ke Kelompok]            │
└─────────────────────────────────────┘
```

### KegiatanCard Component

```typescript
interface KegiatanCardProps {
  kegiatan: SessionSubstage
  assessment?: Assessment             // existing assessment (if any)
  kegiatanName: string                // from programSubstageNameMap
  isMine: boolean                     // ownership check
  onSave: (data: CreateAssessmentDTO) => Promise<void>
  isSavingGlobal: boolean             // disable all cards during any save
}
```

**Local state per card:**
- `starRating: number` — initialized from `assessment?.star_rating ?? 1`
- `comment: string` — initialized from `assessment?.comment ?? ''`
- `isDirty: boolean` — computed: `starRating !== initialStar || comment !== initialComment`
- `saveSuccess: boolean` — temporary success indicator (3s)

**Dirty detection:**
```typescript
const isDirty = starRating !== initialStar || comment !== initialComment
```

Where `initialStar` and `initialComment` are captured from the `assessment` prop at mount time via `useRef` (stable across re-renders, won't reset when parent refreshes assessmentMap).

**Visual indicators:**
- Small colored dot (top-right of card) when `isDirty` — indicates unsaved changes
- Tombol Simpan: active only when `isDirty && !isSavingGlobal`
- After save: "✓ Tersimpan!" text appears for 3 seconds, dot disappears
- Card border subtle color change when `isDirty` (optional, secondary indicator)

**Star rating:**
- Same `StarRatingInput` sub-component (extracted from current inline definition)
- 5 stars, 0 = "Tidak Hadir", 1-5 = score
- Hover/active transitions preserved

**Comment textarea:**
- Always visible (not collapsible)
- 3 rows, 300 char max with live counter
- Placeholder: "Tulis komentar tentang kegiatan ini..."

**Save behavior:**
- Calls `onSave` prop with `CreateAssessmentDTO`
- Disables own button + all other cards during save (`isSavingGlobal`)
- On success: shows "✓ Tersimpan!" for 3s, resets dirty state
- On error: shows toast via `friendlyError()`

### useChildAssessment Hook Changes

**Current:** Manages state for ONE selected kegiatan at a time.

**New:** Fetches all assessments for the participant at once, returns a map.

```typescript
// New return shape
interface UseChildAssessmentReturn {
  loading: boolean
  error: string | null
  childDetail: ChildDetail | null
  assessmentMap: Map<string, Assessment>  // session_substage_id → Assessment
  refreshAssessments: () => Promise<void>  // re-fetch all assessments
  isMine: boolean
}
```

**Key changes:**
- Remove `starRating`, `comment`, `selectedSubstageId`, `selectSubstage`, `saving`, `saveSuccess`, `isDirty`, `handleSave` from hook
- These state values now live inside each `KegiatanCard`
- Hook only provides: data fetching, assessment map, ownership, refresh

### Assessment Fetching

```typescript
// In useChildAssessment:
const assessments = await assessmentService.getByParticipant(childId)
const assessmentMap = new Map<string, Assessment>()
for (const a of assessments) {
  assessmentMap.set(a.session_substage_id, a)
}
```

Each `KegiatanCard` receives its assessment via:
```typescript
const assessment = assessmentMap.get(kegiatan.id)
```

### Parent Component (ChildAssessmentPage)

```tsx
{/* Kegiatan List */}
<div className="space-y-4">
  {childDetail.sessionSubstages.map((kegiatan) => (
    <KegiatanCard
      key={kegiatan.id}
      kegiatan={kegiatan}
      assessment={assessmentMap.get(kegiatan.id)}
      kegiatanName={childDetail.programSubstageNameMap[kegiatan.program_substage_id] ?? `Kegiatan ${idx + 1}`}
      isMine={isMine}
      onSave={handleSaveForKegiatan(kegiatan)}
      isSavingGlobal={savingAny}
    />
  ))}
</div>
```

The parent manages `savingAny` state (true when any card is saving) to disable all other cards during a save.

**`handleSaveForKegiatan` callback:**
```typescript
const [savingAny, setSavingAny] = useState(false)

const handleSaveForKegiatan = useCallback((kegiatan: SessionSubstage) => {
  return async (data: CreateAssessmentDTO) => {
    setSavingAny(true)
    try {
      await assessmentService.upsert(data)
      await refreshAssessments()  // re-fetch all to update assessmentMap
    } finally {
      setSavingAny(false)
    }
  }
}, [refreshAssessments])
```

**Quick Actions card (photo consent):** Preserved below the kegiatan list, only shown when `programStage?.is_photo_stage`. Same position as current implementation — after all Kegiatan cards, before the back button.

---

## Design: Session Start Error Fix

### Problem

When clicking "Mulai Sesi" on a session with no groups/participants/facilitators, the error is a generic "bad request 400".

### Root Cause Analysis

Backend `StartSession()` already validates three conditions in order:
1. `no_groups` — session has 0 groups
2. `facilitator_required` — a group exists but has no `facilitator_id`
3. `no_participants` — a group exists but has 0 participants

Frontend `errorMessages.ts` already maps all three codes:
```typescript
no_groups: 'Sesi harus memiliki minimal satu kelompok.'
no_participants: 'Setiap kelompok harus memiliki minimal satu peserta.'
facilitator_required: 'Belum ada fasilitator yang ditugaskan.'
```

**The issue is likely:** In some edge cases, the backend returns `bad_request` (generic) instead of the specific code. This happens when:
- The `apperrors.BadRequest()` call doesn't include the `code` parameter
- Or the error is caught and re-wrapped before reaching the frontend

### Approach: Backend-Only Verification + Hardening

**Scope:** Verify and harden the backend error responses. No frontend changes needed (error mappings already exist).

### Changes

**File:** `backend/internal/usecase/session.go` — `StartSession()`

Verify the existing validation code returns the correct error codes. The current logic is:

```go
// 1. Status check
if s.Status != entity.SessionDraft && s.Status != entity.SessionCancelled {
    return nil, apperrors.Conflict("bad_request", nil)
}

// 2. Facilitator gate
for i := range groups {
    if groups[i].FacilitatorID == nil || *groups[i].FacilitatorID == "" {
        return nil, apperrors.BadRequest("facilitator_required", nil)
    }
}

// 3. Groups gate
if len(groups) == 0 {
    return nil, apperrors.BadRequest("no_groups", nil)
}

// 4. Participants gate
for i := range groups {
    participants, perr := u.sessionRepo.ListParticipants(ctx, id, groups[i].ID, tenantID)
    if len(participants) == 0 {
        return nil, apperrors.BadRequest("no_participants", nil)
    }
}
```

**Issues to fix:**

1. **Order of checks:** The facilitator gate runs BEFORE the groups gate. If there are 0 groups, the facilitator loop body never executes, so it falls through to `len(groups) == 0` → `no_groups`. This is correct. However, the facilitator check should arguably run AFTER confirming groups exist, for clarity.

2. **Verify `apperrors.BadRequest` response format:** Ensure the error response body always includes `{ error: { code: "...", message: "..." } }` so the frontend `ApiError` class can parse the `code` field.

3. **Consider reordering for clarity:**
   ```go
   // Better order:
   // 1. Status check
   // 2. Groups gate (no_groups) — must exist first
   // 3. Facilitator gate (facilitator_required) — only if groups exist
   // 4. Participants gate (no_participants) — only if groups exist
   ```

**File:** `backend/internal/pkg/errors/` — verify `BadRequest` response format

Ensure `apperrors.BadRequest(code, err)` always produces a response with the `code` field in the body, not just in the HTTP status.

### Verification

After the fix, test these scenarios:
1. Session with 0 groups → should show "Sesi harus memiliki minimal satu kelompok."
2. Session with groups but 0 participants → should show "Setiap kelompok harus memiliki minimal satu peserta."
3. Session with groups + participants but no facilitator → should show "Belum ada fasilitator yang ditugaskan."

---

## Out of Scope

- Frontend `canStart()` changes (user chose backend-only approach)
- Auto-save functionality
- Assessment history / undo
- Bulk save across all kegiatan

---

## Success Criteria

1. ✅ Facilitator can see all Kegiatan cards on one scrollable page
2. ✅ Each card has: name, star rating, comment, save button
3. ✅ Unsaved changes indicated by dot/badge on card
4. ✅ Save button disabled during save, shows success feedback
5. ✅ Session start with no groups → clear Indonesian error message
6. ✅ Session start with no participants → clear Indonesian error message
7. ✅ Session start with no facilitator → clear Indonesian error message

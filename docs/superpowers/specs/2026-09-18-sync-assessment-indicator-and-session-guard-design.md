# Sync Assessment Indicator & Session Guard Design

**Date:** 2026-09-18  
**Scope:** Frontend & Backend  
**Status:** Approved  

## 1. Overview

Fasilitator assessment already uses a 4-star scale with indicator labels `BB`, `MB`, `BSH`, and `BSB`. The admin report review page and the parent-facing mini rapor still render 5 stars without indicator labels. This design aligns all three surfaces to the same 4-star + indicator convention, and adds a backend and frontend guard preventing facilitators from submitting assessments before the session is `ACTIVE`.

## 2. Goals

- Display the same 4-star rating scale and indicator labels on facilitator assessment, admin report review, and mini rapor.
- Show indicator labels next to ratings in a table on the admin report review page.
- Prevent facilitators from rating any participant while the session status is not `ACTIVE`.
- Keep the database schema unchanged; indicator labels are a pure UI mapping from `star_rating`.

## 3. Non-Goals

- No new database columns for indicators.
- No per-program configurable indicator mapping.
- No changes to how badges, narratives, or mission recommendations compute ratings.

## 4. Data Model

`assessments.star_rating` remains an integer `0–4`.

| `star_rating` | Meaning | Indicator label |
|--------------|---------|-----------------|
| 0 | Not scored / absent | `Belum Dinilai` |
| 1 | Beginning | `BB - Belum Berkembang` |
| 2 | Developing | `MB - Mulai Berkembang` |
| 3 | Expected | `BSH - Berkembang Sesuai Harapan` |
| 4 | Excellent | `BSB - Berkembang Sangat Baik` |

The single source of truth for the label mapping is a new shared frontend constant:

```ts
// frontend/src/core/constants/assessment.ts
export const RATING_LABELS: Record<number, string> = {
  0: 'Belum Dinilai',
  1: 'BB - Belum Berkembang',
  2: 'MB - Mulai Berkembang',
  3: 'BSH - Berkembang Sesuai Harapan',
  4: 'BSB - Berkembang Sangat Baik',
}

export const MAX_STAR_RATING = 4
```

All frontend code that renders assessment ratings must import this mapping. The backend continues to store and transmit only `star_rating` integers.

## 5. Frontend Changes

### 5.1 Facilitator `KegiatanCard`

**File:** `frontend/src/features/fasilitator/components/KegiatanCard.tsx`

- Replace the local `RATING_LABELS` constant with the shared import.
- Change the internal `StarRatingInput` to render `[1, 2, 3, 4]` stars.
- Ensure the fallback label for an unknown value shows `${value}/${MAX_STAR_RATING}`.
- Update `aria-label` from `"Nilai ${star} bintang"` to `"Nilai ${star} dari ${MAX_STAR_RATING} bintang"`.

### 5.2 Admin `ReportAssessmentScores`

**File:** `frontend/src/features/admin/components/ReportAssessmentScores.tsx`

- Replace the current card/accordion layout with a table per topic.
- Columns: **Kegiatan**, **Penilaian**, **Indikator**, **Komentar**.
- **Penilaian**: render 4 stars, filled up to `star_rating`.
- **Indikator**: render the label from `RATING_LABELS[star_rating]`.
- **Komentar**: show the italicized comment, or "—" if empty.
- If no assessment exists: show `Belum dinilai` in all three columns.
- If `star_rating === 0` without a comment: show `Tidak hadir`.
- Keep the topic header and the "X/Y dinilai" counter.

### 5.3 Mini Rapor `miniRapor.ts`

**File:** `frontend/src/shared/templates/miniRapor.ts`

- Change `starsHTML(rating)` from 5 stars to 4 stars.
- In `stageRowHTML`, render the indicator label next to the stars using `RATING_LABELS[rating]`.
- Keep the existing data shape `MiniRaportData['stages'][0]['kegiatan']` (it already carries `starRating: number`).

### 5.4 Facilitator `GroupPage`

**File:** `frontend/src/features/fasilitator/pages/GroupPage.tsx`

- Compute `isSessionActive = groupDetail.session.status === SessionStatus.ACTIVE`.
- Pass `disabled={!isMine || !isSessionActive}` to the assess button in `ChildListItem`.
- Show a warning banner directly under the page header when `!isSessionActive`:
  > "Sesi belum dimulai. Penilaian akan tersedia setelah sesi aktif."
- Attendance toggling and kiosk access remain independent of session status.

### 5.5 Facilitator `ChildAssessmentPage`

**File:** `frontend/src/features/fasilitator/pages/ChildAssessmentPage.tsx`

- After data is loaded, if `childDetail.session.status !== SessionStatus.ACTIVE`, render `ErrorState` with:
  > "Sesi belum dimulai. Penilaian tidak dapat dilakukan."
- Keep a working "Kembali ke Kelompok" button.
- All inputs and the save button remain disabled by `!isMine` or the error state.

## 6. Backend Changes

### 6.1 Assessment Usecase Session Guard

**File:** `backend/internal/usecase/assessment/assessment.go`

- Add a `sessionRepo repository.SessionRepository` field to the `Usecase` struct.
- Update `NewUsecase(repo, sessionRepo, badgeUC)`.
- In `Upsert`, after validating ownership, fetch the session by `req.SessionID` using `sessionRepo.GetSessionByID`.
- If `session.Status != entity.SessionActive`, return:
  ```go
  apperrors.Forbidden("session_not_active", errors.New("assessment can only be submitted when session is active"))
  ```
- If `req.SessionID` is empty, return `BadRequest`.

### 6.2 DI Wiring

**Files:**
- `backend/cmd/server/main.go`
- `backend/internal/delivery/http/handler/router.go` or wherever `assessment.NewUsecase` is instantiated

- Pass the existing `sessionRepo` instance into `assessment.NewUsecase`.

### 6.3 Tests

**File:** `backend/internal/usecase/assessment/assessment_test.go` (if exists) or create one.

- Mock `SessionRepository` to return `ACTIVE` and non-`ACTIVE` sessions.
- Assert that upsert succeeds when session is `ACTIVE`.
- Assert that upsert returns `session_not_active` when session is `DRAFT`, `COMPLETED`, or `CANCELLED`.

## 7. Error Handling & UX

| Scenario | Expected behavior |
|----------|-------------------|
| Facilitator opens group page before session starts | Group visible; "Nilai" buttons disabled; banner shown. |
| Facilitator opens assessment URL directly before session starts | Error state "Sesi belum dimulai" shown; no input allowed. |
| Facilitator submits via API before session starts | Backend returns `403 session_not_active`; frontend shows toast error. |
| Admin reviews report | Table shows 4 stars + indicator label + comment per kegiatan. |
| Parent views mini rapor | Each kegiatan shows 4 stars + indicator label. |

## 8. Testing Plan

- **Unit:** Backend assessment usecase session-status guard.
- **Manual / UI:**
  - Facilitator group page when session is DRAFT vs ACTIVE.
  - Facilitator assessment page when session is not ACTIVE.
  - Admin report review page shows 4 stars + labels.
  - Mini rapor PDF/PNG shows 4 stars + labels.
- **Integration:** Submit assessment via API for a DRAFT session and expect `403`.

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Existing reports with `star_rating = 5` | The backend validation already limits `max=4`; any stale `5` is a data issue outside this change. The UI will render label fallback "5/4" until data is cleaned. |
| Parent mini rapor layout breaks with longer labels | Cap label font size to `text-[11px]` and allow wrapping; keep star row flex with `gap-1`. |
| Backend DI wiring changes break build | Update all call sites of `assessment.NewUsecase` in one commit. |

## 10. Files to Modify

- `frontend/src/core/constants/assessment.ts` (new)
- `frontend/src/features/fasilitator/components/KegiatanCard.tsx`
- `frontend/src/features/admin/components/ReportAssessmentScores.tsx`
- `frontend/src/shared/templates/miniRapor.ts`
- `frontend/src/features/fasilitator/pages/GroupPage.tsx`
- `frontend/src/features/fasilitator/pages/ChildAssessmentPage.tsx`
- `backend/internal/usecase/assessment/assessment.go`
- `backend/cmd/server/main.go`
- `backend/internal/delivery/http/handler/router.go` (where applicable)
- `backend/internal/usecase/assessment/assessment_test.go` (add tests)

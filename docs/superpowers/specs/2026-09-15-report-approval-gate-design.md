# Report Approval Gate: Group Completion Prerequisite

**Date**: 2026-09-15
**Status**: Draft
**Author**: Brainstorming session with user

## Problem Statement

Currently, admin can approve a report ("Setujui Rapor") regardless of whether the participant's group has been completed by the facilitator. This creates a business logic gap where reports can be approved before the facilitator has finished assessing all participants in the group.

Additionally, when a facilitator clicks "Selesaikan Kelompok" (Complete Group), the action only:
1. Marks each kegiatan leaf as COMPLETED via `POST /api/session-substages/:id/complete`
2. Logs a timeline event `group:completed`

It does **NOT** update `session_groups.status` to `COMPLETED`. The status is only set when the entire session is completed via `POST /api/sessions/:id/complete`.

## Goals

1. **Update group status on completion**: When facilitator completes a group, automatically set `session_groups.status = COMPLETED` in the backend.
2. **Gate report approval**: Backend validates that the participant's group is COMPLETED before allowing report approval.
3. **Disable UI button**: Frontend disables the "Setujui" button with a tooltip when the group is not completed.

## Design

### 1. Backend: Auto-update Group Status on Completion

**Location**: `backend/internal/usecase/badge/badge.go`

Add a new method `CheckAndCompleteGroup` that is called after each `CompleteSessionSubstage`. This method checks whether ALL kegiatan leaves for the group's active SubTopik are completed. If yes, it updates `session_groups.status = COMPLETED`.

**Flow**:
```
CompleteSessionSubstage(ctx, sessionSubstageID, callerTenant)
  → mark leaf COMPLETED
  → badge evaluation per participant
  → NEW: CheckAndCompleteGroup(ctx, sessionID, groupID, tenantID)
    → List all session_substages for the session
    → List all group_stage_progress for the group
    → If ALL progress = COMPLETED or SKIPPED
      → UpdateGroup(sessionID, groupID, "COMPLETED")
```

**Method signature**:
```go
func (u *Usecase) CheckAndCompleteGroup(ctx context.Context, sessionID, groupID, tenantID string) error
```

**Dependency injection**: Badge usecase currently does NOT have `sessionRepo`. Need to add `sessionRepo repository.SessionRepository` field to `Usecase` struct and inject it via `NewUsecase()` or a setter method (following the existing pattern of `SetAssessmentRepo`).

**Logic**:
1. Fetch all session substages for the session (via `substageRepo.ListSessionSubstages`)
2. Fetch all group_stage_progress rows for the group (via `sessionRepo.ListGroupStageProgress`)
3. Check if every progress row is COMPLETED or SKIPPED
4. If yes → call `sessionRepo.UpdateSessionGroup` to set group status to COMPLETED
5. Log the completion event

### 2. Backend: Report Approval Gate

**Location**: `backend/internal/usecase/reports/reports.go`

Add group status validation in the `Approve` method before setting the report status to APPROVED.

**Flow**:
```
Usecase.Approve(ctx, reportID, tenantID, approvedBy, narrativeFinal, missionIDs)
  → repo.GetByID(ctx, reportID, tenantID)  // existing
  → NEW: resolve participant's group
    → sessionRepo.GetParticipantByID(ctx, r.ParticipantID, tenantID)
    → if participant.GroupID != nil:
      → sessionRepo.GetSessionGroupByID(ctx, *participant.GroupID, tenantID)
      → if group.Status != entity.GroupCompleted:
        → return error("group_not_completed", "Kelompok belum diselesaikan oleh fasilitator")
  → [existing approve logic...]
```

**Error response**:
```json
{
  "error": {
    "code": "group_not_completed",
    "message": "Kelompok belum diselesaikan oleh fasilitator"
  }
}
```

**Edge cases**:
- Participant without a group (GroupID == NULL) → skip validation (can still approve)
- Group COMPLETED → proceed as normal

### 3. Frontend: Disable Approve Button

**Locations**:
- `frontend/src/features/admin/hooks/useReportReview.ts`
- `frontend/src/features/admin/pages/ReportReviewPage.tsx`

**Changes to `useReportReview.ts`**:
1. When fetching report data, also fetch participant → resolve group → fetch group status
2. Add state `groupCompleted: boolean`
3. Expose `groupCompleted` to `ReportReviewPage`

**Data flow**:
```
useReportReview.fetchData()
  → [existing fetches...]
  → NEW: apiRequest(`/api/participants/${report.participant_id}`)
    → resolve participant.group_id
    → NEW: apiRequest(`/api/sessions/${report.session_id}/groups/${participant.group_id}`)
      → set groupCompleted = group.status === 'COMPLETED'
```

**Changes to `ReportReviewPage.tsx`**:
- Disable "Setujui" button when `!groupCompleted`
- Add tooltip: "Kelompok belum diselesaikan oleh fasilitator"

**UI behavior**:
- Button disabled + tooltip when group not completed
- Button active when group completed
- Status banner unchanged

## Files Changed

| Layer | File | Change |
|-------|------|--------|
| Backend | `backend/internal/usecase/badge/badge.go` | Add `CheckAndCompleteGroup()` method |
| Backend | `backend/internal/usecase/reports/reports.go` | Add group status validation in `Approve()` |
| Frontend | `frontend/src/features/admin/hooks/useReportReview.ts` | Fetch group status, expose `groupCompleted` |
| Frontend | `frontend/src/features/admin/pages/ReportReviewPage.tsx` | Disable button + tooltip |
| Test | `tmp/test-report-approval-gate.mjs` | Puppeteer E2E test |

## Error Handling

### Backend: Report Approval Gate (`Approve` usecase)

| Scenario | Error Code | HTTP Status | Message |
|----------|-----------|-------------|---------|
| Group not completed | `group_not_completed` | 400 Bad Request | "Kelompok belum diselesaikan oleh fasilitator" |
| Participant not found | `not_found` | 404 Not Found | "Peserta tidak ditemukan" |
| Group not found | `not_found` | 404 Not Found | "Kelompok tidak ditemukan" |
| Report not found | `not_found` | 404 Not Found | "Laporan tidak ditemukan" |
| Internal error | `internal_error` | 500 Internal Server Error | "Terjadi kesalahan server" |

**Implementation**: Use `apperrors.BadRequest("group_not_completed", nil)` which the middleware `ErrorHandler` converts to the standard envelope `{ error: { code, message } }`.

### Backend: Group Status Update (`CheckAndCompleteGroup`)

| Scenario | Handling |
|----------|----------|
| All leaves completed | Update `session_groups.status = COMPLETED` |
| Some leaves not completed | No-op (group stays IN_PROGRESS) |
| Group already COMPLETED | Idempotent — no-op, no error |
| Database error on status update | Log error, don't block leaf completion (leaf is still COMPLETED) |
| Group not found | Log warning, skip (defensive) |

**Key invariant**: `CheckAndCompleteGroup` errors NEVER block the `CompleteSessionSubstage` operation. The leaf completion is the primary operation; group status update is a side effect.

### Frontend: Button Disable

| Scenario | Behavior |
|----------|----------|
| Group COMPLETED | Button enabled, normal flow |
| Group not completed | Button disabled + tooltip "Kelompok belum diselesaikan oleh fasilitator" |
| Participant has no group | Button enabled (skip validation) |
| Group status fetch fails | Button enabled (fail-open — don't block admin due to network issues) |
| API returns `group_not_completed` | Toast error "Kelompok belum diselesaikan oleh fasilitator" (defense-in-depth) |

**Fail-open principle**: If the frontend cannot determine group status (network error, API failure), the button stays enabled. The backend gate is the source of truth — if the backend rejects, the toast shows the error. This avoids permanently blocking admins due to transient frontend issues.

## Testing Strategy

### 1. Manual Smoke Test
- Facilitator completes group → check `session_groups.status = COMPLETED` in DB
- Admin tries to approve report before group is completed → gets error
- Admin approves report after group is completed → succeeds

### 2. Puppeteer E2E Test
- File: `tmp/test-report-approval-gate.mjs`
- Uses `puppeteer-core` connecting to running browser
- Test scenarios:
  1. Login as admin → navigate to report review → verify button disabled when group not completed
  2. Login as facilitator → complete group → verify group status = COMPLETED
  3. Return as admin → verify button enabled → approve → verify success

### 3. Build Verification
- Backend: `go build ./...` + `go vet ./...` + `gofmt -l .`
- Frontend: `pnpm build`

## Scope

- **In scope**: Group completion status update + report approval gate + frontend disable
- **Out of scope**: Bulk approve, session completion flow, report send flow (unchanged)

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    FACILITATOR FLOW                         │
│                                                             │
│  GroupPage.tsx                                              │
│  ┌─────────────────────┐                                    │
│  │ "Selesaikan Kelompok"│                                   │
│  └─────────┬───────────┘                                    │
│            │                                                │
│            ▼                                                │
│  for each leaf:                                             │
│  POST /api/session-substages/:id/complete                   │
│            │                                                │
│            ▼                                                │
│  BadgeUsecase.CompleteSessionSubstage()                     │
│            │                                                │
│            ▼                                                │
│  CheckAndCompleteGroup() ← NEW                              │
│            │                                                │
│            ▼                                                │
│  PUT /api/sessions/:sid/groups/:gid { status: COMPLETED }   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    ADMIN FLOW                               │
│                                                             │
│  ReportReviewPage.tsx                                       │
│  ┌─────────────────────┐                                    │
│  │ "Setujui Rapor"     │ ← disabled if !groupCompleted     │
│  └─────────┬───────────┘                                    │
│            │                                                │
│            ▼                                                │
│  POST /api/reports/:id/approve                              │
│            │                                                │
│            ▼                                                │
│  ReportUsecase.Approve()                                    │
│            │                                                │
│            ▼                                                │
│  NEW: validate group.Status == COMPLETED                    │
│            │                                                │
│            ├─ NOT COMPLETED → error "group_not_completed"   │
│            │                                                │
│            └─ COMPLETED → proceed with approval             │
└─────────────────────────────────────────────────────────────┘
```

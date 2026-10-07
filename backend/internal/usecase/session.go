package usecase

import (
	"context"
	"fmt"
	"log"
	"strings"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/pkg/phoneutil"
	"kidversa-edutourism-backend/internal/pkg/util"
)

// ProgramStageReader provides read-only access to Topik.
// SessionUsecase uses this to clone Topik into session Topik
// during session creation (Interface Segregation Principle).
type ProgramStageReader interface {
	ListStages(ctx context.Context, programID string) ([]entity.ProgramStage, error)
}

// ProgramSubstageReader provides read-only access to Kegiatan.
// SessionUsecase uses this to clone Kegiatan into session Kegiatan
// during session creation.
type ProgramSubstageReader interface {
	ListSubstages(ctx context.Context, programStageID string) ([]entity.ProgramSubstage, error)
}

// ProgramReader provides read-only access to a Program by ID.
// SessionUsecase uses this to verify the program exists before
// creating a session (strict create gate).
type ProgramReader interface {
	GetProgramByID(ctx context.Context, id string) (*entity.Program, error)
}

// BadgeReconciler is the minimal contract SessionUsecase needs to reconcile a
// participant's badges after a same-program migration (LinkParticipant) —
// kept narrow (same pattern as assessment.BadgeEvaluator and
// live.GroupCompletionValidator) so the session usecase does not depend on the
// badge usecase package. RecomputeFinalBadge is the badge package's single
// reconcile entry point: it awards the FINAL badge only when every Topik of
// the program has its TOPIK badge and revokes a stale FINAL otherwise.
type BadgeReconciler interface {
	RecomputeFinalBadge(ctx context.Context, participantID, programID string) (*entity.ParticipantBadge, error)
}

// SessionUsecase orchestrates session + Topik + groups + participants business logic.
type SessionUsecase struct {
	sessionRepo      repository.SessionRepository
	programStages    ProgramStageReader
	programs         ProgramReader
	programSubstages ProgramSubstageReader
	sessionSubstages repository.SessionSubstageRepository
	assessmentRepo   repository.AssessmentRepository
	attendanceRepo   repository.AttendanceRepository
	userRepo         repository.UserRepository
	badgeReconciler  BadgeReconciler
	photoRepo        repository.PhotoRepository
	uploadDir        string
	reportRepo       repository.ReportRepository
	missionRepo      repository.ParticipantMissionRepository
}

// NewSessionUsecase builds the session usecase.
func NewSessionUsecase(sessionRepo repository.SessionRepository, programStages ProgramStageReader) *SessionUsecase {
	return &SessionUsecase{sessionRepo: sessionRepo, programStages: programStages}
}

// SetSubstageRepos injects the program Kegiatan reader and session Kegiatan repo
// used for Kegiatan cloning in CreateSession. Kept separate from the constructor
// to avoid perturbing existing call sites while the Kegiatan feature lands.
func (u *SessionUsecase) SetSubstageRepos(programSubstages ProgramSubstageReader, sessionSubstages repository.SessionSubstageRepository) {
	u.programSubstages = programSubstages
	u.sessionSubstages = sessionSubstages
}

// SetProgramReader injects the program reader used by the strict
// create gate in CreateSession to verify the program exists.
func (u *SessionUsecase) SetProgramReader(p ProgramReader) { u.programs = p }

// SetAssessmentRepo injects the assessment repo used to clone scored assessments
// when a participant migrates to a new session (LinkParticipant).
func (u *SessionUsecase) SetAssessmentRepo(assessmentRepo repository.AssessmentRepository) {
	u.assessmentRepo = assessmentRepo
}

// SetAttendanceRepo injects the attendance repo used to carry the participant's
// attendance row to the new session when a participant migrates (LinkParticipant).
func (u *SessionUsecase) SetAttendanceRepo(attendanceRepo repository.AttendanceRepository) {
	u.attendanceRepo = attendanceRepo
}

// SetUserRepo injects the user repo used to resolve a group's facilitator name
// for the session detail view (so non-admin callers don't need GET /api/users).
func (u *SessionUsecase) SetUserRepo(userRepo repository.UserRepository) {
	u.userRepo = userRepo
}

// SetPhotoSnapshot injects the photo repo and UploadDir used to snapshot the
// participant's gallery photos when they migrate to a new session of the same
// program (LinkParticipant): each same-topic photo is copied WITH its own file
// under UploadDir, so deleting a photo in one session never unlinks the other
// session's file. Optional: unwired (nil repo or empty dir) skips the copy,
// like the other optional LinkParticipant dependencies.
func (u *SessionUsecase) SetPhotoSnapshot(photoRepo repository.PhotoRepository, uploadDir string) {
	u.photoRepo = photoRepo
	u.uploadDir = uploadDir
}

// SetBadgeReconciler injects the badge usecase used to reconcile the
// participant's FINAL badge after a same-program migration (LinkParticipant):
// when the program grew Topik since the badge was earned, the stale FINAL must
// be revoked immediately. Optional: unwired (nil) skips the reconcile.
func (u *SessionUsecase) SetBadgeReconciler(b BadgeReconciler) {
	u.badgeReconciler = b
}

// SetReportCloneDeps injects the report + participant-mission repos used to
// clone the participant's reports (rapor) to the new session when a
// participant migrates (LinkParticipant): each source report is copied per
// (participant, session, program_stage) with a FRESH parent token, status
// downgraded to DRAFT (the source row keeps its own status untouched),
// sent_at = nil, and a provenance snapshot of the source session
// (id/name/status), and its participant_missions follow onto the clone.
// Optional: unwired (either nil) skips the clone entirely, like the other
// optional LinkParticipant dependencies — production wiring in
// cmd/server/main.go is mandatory so reports are never silently left behind.
func (u *SessionUsecase) SetReportCloneDeps(rr repository.ReportRepository, mr repository.ParticipantMissionRepository) {
	u.reportRepo = rr
	u.missionRepo = mr
}

// CreateSession creates a new DRAFT session owned by the tenant.
func (u *SessionUsecase) CreateSession(ctx context.Context, tenantID, createdBy string, programID, name, sessionDate, startTime, endTime, location, notes string) (*entity.Session, error) {
	if u.programs != nil {
		if _, err := u.programs.GetProgramByID(ctx, programID); err != nil {
			return nil, err
		}
	}
	stages, gerr := u.programStages.ListStages(ctx, programID)
	if gerr != nil {
		return nil, gerr
	}
	if len(stages) == 0 {
		return nil, apperrors.BadRequest("program_has_no_topics", nil)
	}
	if u.programSubstages != nil {
		for i := range stages {
			subs, serr := u.programSubstages.ListSubstages(ctx, stages[i].ID)
			if serr != nil {
				return nil, serr
			}
			if len(subs) == 0 {
				return nil, apperrors.BadRequest("topic_has_no_activities", nil)
			}
		}
	}
	tp := &tenantID
	if tenantID == "" {
		tp = nil
	}
	cb := &createdBy
	if createdBy == "" {
		cb = nil
	}
	var st, et *string
	if startTime != "" {
		st = &startTime
	}
	if endTime != "" {
		et = &endTime
	}
	s := &entity.Session{
		TenantID:    tp,
		ProgramID:   programID,
		Name:        name,
		SessionDate: sessionDate,
		StartTime:   st,
		EndTime:     et,
		Location:    location,
		Notes:       notes,
		Status:      entity.SessionDraft,
		CreatedBy:   cb,
	}
	err := u.sessionRepo.Transaction(ctx, func(tx repository.SessionRepository) error {
		// Tahap 2 step 8: re-read the program INSIDE the session-creation
		// transaction so a program deleted between the pre-gate above and
		// this write cannot orphan the new session (Count-then-Delete
		// narrowing, no lock redesign). The program repo's not_found covers
		// both hard and soft deletes (GORM DeletedAt scope) and is
		// re-mapped to program_not_found like requireSessionProgram.
		// NEEDS-RUNTIME-VERIFICATION for concurrent coverage.
		if u.programs != nil {
			if _, err := u.programs.GetProgramByID(ctx, programID); err != nil {
				if _, code, ok := apperrors.AsAppError(err); ok && code == "not_found" {
					return apperrors.NotFound("program_not_found", err)
				}
				return err
			}
		}
		if err := tx.CreateSession(ctx, s); err != nil {
			return err
		}
		programStages, err := u.programStages.ListStages(ctx, programID)
		if err != nil {
			return err
		}
		for _, ps := range programStages {
			ss := &entity.SessionStage{
				SessionID:      s.ID,
				ProgramStageID: ps.ID,
				Status:         entity.SessionStageWaiting,
			}
			if err := tx.CreateSessionStage(ctx, ss); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	// Clone Kegiatan into session Kegiatan so each
	// participant has a concrete leaf to assess. Runs after the session tx
	// commits (s.ID is now populated); the Kegiatan repos are wired
	// optionally, so a missing wiring simply skips cloning.
	if u.programSubstages != nil && u.sessionSubstages != nil {
		if cerr := u.cloneSubstages(ctx, s.ID, programID); cerr != nil {
			return nil, cerr
		}
	}
	return s, nil
}

// GetSession returns the expanded session detail (stages + groups + participants),
// tenant-scoped.
func (u *SessionUsecase) GetSession(ctx context.Context, id, tenantID string) (*repository.SessionDetail, error) {
	s, err := u.sessionRepo.GetSessionByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	stages, err := u.sessionRepo.ListSessionStages(ctx, id)
	if err != nil {
		return nil, err
	}
	groups, err := u.sessionRepo.ListSessionGroups(ctx, id)
	if err != nil {
		return nil, err
	}
	gwp := make([]repository.GroupWithParticipants, 0, len(groups))
	for i := range groups {
		ps, err := u.sessionRepo.ListParticipants(ctx, id, groups[i].ID, tenantID)
		if err != nil {
			return nil, err
		}
		g := repository.GroupWithParticipants{SessionGroup: groups[i], Participants: ps}
		if groups[i].FacilitatorID != nil && u.userRepo != nil {
			if f, ferr := u.userRepo.GetByID(ctx, *groups[i].FacilitatorID); ferr == nil && f != nil {
				g.FacilitatorName = f.Name
			}
		}
		gwp = append(gwp, g)
	}
	return &repository.SessionDetail{Session: *s, Stages: stages, Groups: gwp}, nil
}

// ListSessions returns paginated sessions for a tenant with optional filters.
func (u *SessionUsecase) ListSessions(ctx context.Context, f repository.SessionFilter, page, limit int) (*repository.Paginated[entity.Session], error) {
	return u.sessionRepo.ListSessions(ctx, f, page, limit)
}

// requireSessionProgram verifies the session's program still exists before a
// lifecycle transition (audit #3), mirroring the strict create gate in
// CreateSession. The program repo's not_found covers both a hard delete and a
// soft delete (GORM's DeletedAt scope), and is re-mapped to program_not_found
// so callers see "the program behind this session is gone" instead of a
// generic 404 that only fires later in badge/report code. Skipped when the
// program reader is unwired (defensive, same as CreateSession; production
// wiring: cmd/server/main.go SetProgramReader).
func (u *SessionUsecase) requireSessionProgram(ctx context.Context, programID string) error {
	if u.programs == nil {
		return nil
	}
	if _, err := u.programs.GetProgramByID(ctx, programID); err != nil {
		if _, code, ok := apperrors.AsAppError(err); ok && code == "not_found" {
			return apperrors.NotFound("program_not_found", err)
		}
		return err
	}
	return nil
}

// StartSession transitions a session DRAFT -> ACTIVE (cascades Topik to ACTIVE).
//
// Atomicity + concurrency (audit #14): the status write, the stage cascade
// and the progress seed all run inside ONE session-repo transaction, and the
// session row is re-read under SELECT ... FOR UPDATE
// (GetSessionByIDForUpdate) inside it — mirroring CancelSession. A
// concurrent CancelSession and a StartSession serialize on the row lock
// instead of interleaving, and the program re-read below runs inside the tx
// (mirroring CreateSession's in-tx re-read) so a program deleted between the
// pre-gate and this write cannot orphan an ACTIVE session.
func (u *SessionUsecase) StartSession(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	pre, err := u.sessionRepo.GetSessionByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	// Audit #19: a CANCELLED session is cancelled PERMANENTLY — reactivation is
	// rejected before any other gate so the reason is unambiguous (the old
	// code explicitly allowed CANCELLED -> ACTIVE).
	if pre.Status == entity.SessionCancelled {
		return nil, apperrors.Forbidden("session_cancelled_permanent", nil)
	}
	if pre.Status != entity.SessionDraft {
		return nil, apperrors.Conflict("bad_request", nil)
	}
	// Audit #3: the session's program must still exist (hard- or soft-deleted
	// counts as gone) before the session goes live — otherwise it runs until it
	// fails downstream (badge/report lookups 404 on the missing program).
	if perr := u.requireSessionProgram(ctx, pre.ProgramID); perr != nil {
		return nil, perr
	}
	// Gate: session must have at least one group.
	groups, gerr := u.sessionRepo.ListSessionGroups(ctx, id)
	if gerr != nil {
		return nil, gerr
	}
	if len(groups) == 0 {
		return nil, apperrors.BadRequest("no_groups", nil)
	}
	// Facilitator assignment gate: every group must have a facilitator assigned
	// before the session can start.
	for i := range groups {
		if groups[i].FacilitatorID == nil || *groups[i].FacilitatorID == "" {
			return nil, apperrors.BadRequest("facilitator_required", nil)
		}
	}
	// Gate: every group must have at least one participant.
	for i := range groups {
		participants, perr := u.sessionRepo.ListParticipants(ctx, id, groups[i].ID, tenantID)
		if perr != nil {
			return nil, perr
		}
		if len(participants) == 0 {
			return nil, apperrors.BadRequest("no_participants", nil)
		}
	}
	var started *entity.Session
	err = u.sessionRepo.Transaction(ctx, func(tx repository.SessionRepository) error {
		s, err := tx.GetSessionByIDForUpdate(ctx, id, tenantID)
		if err != nil {
			return err
		}
		if s.Status == entity.SessionCancelled {
			return apperrors.Forbidden("session_cancelled_permanent", nil)
		}
		if s.Status != entity.SessionDraft {
			return apperrors.Conflict("bad_request", nil)
		}
		// In-tx program re-read (mirror CreateSession's re-read lines): the
		// program repo's not_found covers both hard and soft deletes and is
		// re-mapped to program_not_found like requireSessionProgram, so a
		// program deleted between the pre-gate above and this write cannot
		// orphan an ACTIVE session.
		if u.programs != nil {
			if _, err := u.programs.GetProgramByID(ctx, s.ProgramID); err != nil {
				if _, code, ok := apperrors.AsAppError(err); ok && code == "not_found" {
					return apperrors.NotFound("program_not_found", err)
				}
				return err
			}
		}
		s.Status = entity.SessionActive
		if err := tx.UpdateSession(ctx, s); err != nil {
			return err
		}
		// Cascade: stages WAITING -> ACTIVE.
		stages, err := tx.ListSessionStages(ctx, id)
		if err != nil {
			return err
		}
		for i := range stages {
			if stages[i].Status == entity.SessionStageWaiting {
				stages[i].Status = entity.SessionStageActive
				now := util.Now()
				stages[i].StartedAt = &now
				if err := tx.UpdateSessionStage(ctx, &stages[i]); err != nil {
					return err
				}
			}
		}
		// Seed a LOCKED progress row for every (group, session Kegiatan) pair so the
		// live monitor renders real per-Kegiatan state instead of treating every group
		// as locked. group_stage_progress.session_substage_id is an FK to
		// session Kegiatan (the Kegiatan leaf), so seed per Kegiatan — not per
		// session Topik. session Kegiatan is populated on CreateSession via
		// cloneSubstages; skip gracefully when it is unwired or empty (idempotent).
		if u.sessionSubstages != nil {
			subs, serr := u.sessionSubstages.ListSessionSubstages(ctx, id)
			if serr != nil {
				return serr
			}
			if len(subs) > 0 {
				existing, eerr := tx.ListGroupStageProgress(ctx, subs[0].ID)
				if eerr != nil {
					return eerr
				}
				if len(existing) == 0 {
					groups, gerr := tx.ListSessionGroups(ctx, id)
					if gerr != nil {
						return gerr
					}
					for i := range groups {
						for j := range subs {
							if cerr := tx.CreateGroupStageProgress(ctx, &entity.GroupStageProgress{
								GroupID:           groups[i].ID,
								SessionSubstageID: subs[j].ID,
								Status:            entity.ProgressLocked,
							}); cerr != nil {
								return cerr
							}
						}
					}
				}
			}
		}
		started = s
		return nil
	})
	if err != nil {
		return nil, err
	}
	return started, nil
}

// CompleteSession transitions a session ACTIVE -> COMPLETED (cascades Topik
// and groups to COMPLETED).
//
// Atomicity (audit #12): the status write, the stage stamps and the group
// stamps all run inside ONE session-repo transaction — a failure at any step
// rolls the whole thing back, so a session can never end up COMPLETED with
// live ACTIVE Topik (or vice versa).
//
// Concurrency (audit #14): the session row is re-read under SELECT ... FOR
// UPDATE (GetSessionByIDForUpdate) inside the transaction, mirroring
// CancelSession exactly (same helper, same must-be-in-tx contract): a
// concurrent CancelSession and a CompleteSession serialize on the row lock —
// whichever commits first decides, the loser sees the terminal status and
// rejects instead of interleaving.
//
// Safe retry: completion requires ACTIVE, and a rolled-back attempt leaves
// the session ACTIVE (the status write is part of the rolled-back tx), so
// retrying the completion after fixing the failure is safe.
func (u *SessionUsecase) CompleteSession(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	var completed *entity.Session
	err := u.sessionRepo.Transaction(ctx, func(tx repository.SessionRepository) error {
		s, err := tx.GetSessionByIDForUpdate(ctx, id, tenantID)
		if err != nil {
			return err
		}
		if s.Status != entity.SessionActive {
			return apperrors.Conflict("bad_request", nil)
		}
		// Audit #3: the session's program must still exist before completion — a
		// session whose program was deleted must not be closed into an orphan
		// whose badge/report generation 404s. Runs before any grading gate so a
		// missing program reports program_not_found (no writes have happened yet).
		if perr := u.requireSessionProgram(ctx, s.ProgramID); perr != nil {
			return perr
		}
		// Grading completeness gate: every participant in every group must be graded
		// for every session Kegiatan before the session can be completed. The gate
		// must read assessments under the session's own tenant: the tenant scope
		// resolves via session_id -> sessions.tenant_id, so a placeholder tenant
		// matches no sessions and reports every participant as ungraded.
		gateTenant := tenantID
		if s.TenantID != nil && *s.TenantID != "" {
			gateTenant = *s.TenantID
		}
		if ungraded, gerr := u.firstUngradedGroup(ctx, id, gateTenant); gerr != nil {
			return gerr
		} else if ungraded != "" {
			// Observability only: the gate decision is unchanged (grading_incomplete).
			// The group name + leaf count pinpoint which group/topic blocks completion
			// without loosening the validator (Bug1's fix owns the gate itself).
			leafCount := 0
			if u.sessionSubstages != nil {
				if subs, serr := u.sessionSubstages.ListSessionSubstages(ctx, id); serr == nil {
					leafCount = len(subs)
				}
			}
			log.Printf("session: complete blocked session=%s gate=grading_incomplete group=%q substage_leaves=%d", id, ungraded, leafCount)
			return apperrors.BadRequest("grading_incomplete", nil)
		}
		// Completion gate, hierarchy step 1: enumerate Topik before any write so a
		// read failure surfaces here instead of stranding a COMPLETED session with
		// ACTIVE Topik (the cascade re-lists stages after UpdateSession). The count
		// feeds the block log below — same observability pattern as the grading gate.
		topics, terr := tx.ListSessionStages(ctx, id)
		if terr != nil {
			return terr
		}
		// Facilitator completion gate: every Kelompok holding a present peserta must
		// already be COMPLETED by its facilitator (PUT .../groups/:groupId →
		// badge.CheckAndCompleteGroup). Runs AFTER the grading gate so
		// grading_incomplete keeps global precedence; no mutation has happened yet,
		// so a rejection leaves the whole session untouched.
		if pending, gerr := u.firstPendingFacilitatorGroup(ctx, id, gateTenant); gerr != nil {
			return gerr
		} else if pending != "" {
			log.Printf("session: complete blocked session=%s gate=group_completion_pending group=%q topics=%d", id, pending, len(topics))
			return apperrors.BadRequest("group_completion_pending", nil)
		}
		s.Status = entity.SessionCompleted
		if err := tx.UpdateSession(ctx, s); err != nil {
			return err
		}
		stages, err := tx.ListSessionStages(ctx, id)
		if err != nil {
			return err
		}
		for i := range stages {
			stages[i].Status = entity.SessionStageCompleted
			now := util.Now()
			stages[i].CompletedAt = &now
			if err := tx.UpdateSessionStage(ctx, &stages[i]); err != nil {
				return err
			}
		}
		groups, err := tx.ListSessionGroups(ctx, id)
		if err != nil {
			return err
		}
		for i := range groups {
			groups[i].Status = entity.GroupCompleted
			if err := tx.UpdateSessionGroup(ctx, &groups[i]); err != nil {
				return err
			}
		}
		completed = s
		return nil
	})
	if err != nil {
		return nil, err
	}
	return completed, nil
}

// CancelSession transitions a session to CANCELLED and stamps every
// non-terminal Topik (WAITING and ACTIVE) as CANCELLED (audit #18 — never
// COMPLETED, no completed_at).
//
// Re-cancel (CANCELLED -> CANCELLED) is an idempotent success (HTTP 200): the
// returned session carries AlreadyCancelled=true ("already_cancelled") so
// callers can tell the no-op apart from a fresh cancel without a new status
// code. The stage loop re-runs so a leftover non-terminal stage converges
// instead of stranding live stages on a cancelled session.
//
// Atomicity (audit #12): the status write, the stage stamps and the cancel
// fields all run inside ONE session-repo transaction — a failure at any step
// rolls the whole thing back, so a session can never end up CANCELLED with
// live ACTIVE stages (or vice versa).
//
// Concurrency (audit #14): the session row is re-read under SELECT ... FOR
// UPDATE (GetSessionByIDForUpdate) inside the transaction. The assessment
// upsert takes the same lock before writing, so a cancel and a score
// serialize: whichever commits first decides — a score can no longer land
// silently on a session that was cancelled between its status check and its
// write.
func (u *SessionUsecase) CancelSession(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	var cancelled *entity.Session
	err := u.sessionRepo.Transaction(ctx, func(tx repository.SessionRepository) error {
		s, err := tx.GetSessionByIDForUpdate(ctx, id, tenantID)
		if err != nil {
			return err
		}
		if s.Status == entity.SessionCompleted {
			return apperrors.Conflict("bad_request", nil)
		}
		if s.Status == entity.SessionCancelled {
			// Idempotent re-cancel: already CANCELLED is a success (HTTP 200),
			// marked so callers can tell the no-op apart from a fresh cancel.
			// The stage loop below still runs so a leftover non-terminal
			// stage converges instead of stranding live stages.
			cancelled = s
			cancelled.AlreadyCancelled = true
		} else {
			s.Status = entity.SessionCancelled
			if err := tx.UpdateSession(ctx, s); err != nil {
				return err
			}
			cancelled = s
		}
		stages, err := tx.ListSessionStages(ctx, id)
		if err != nil {
			return err
		}
		for i := range stages {
			if stages[i].Status == entity.SessionStageActive || stages[i].Status == entity.SessionStageWaiting {
				// Audit #18: a cancelled stage reads CANCELLED — it was NOT
				// completed, so no completed_at is stamped. WAITING stages are
				// non-terminal too: leaving them WAITING would strand a live
				// stage on a cancelled session (and the FE stage map would
				// show a runnable Topik for a dead session).
				stages[i].Status = entity.SessionStageCancelled
				if err := tx.UpdateSessionStage(ctx, &stages[i]); err != nil {
					return err
				}
			}
		}
		// Revoke outstanding parent-consent tokens in the SAME transaction:
		// a cancelled session never accepts consent writes (RespondCombined
		// and SendWhatsApp both gate on CANCELLED), so live tokens would be
		// dead links. Atomic here — a rollback restores the tokens together
		// with the session/stage statuses.
		if err := tx.ClearParticipantTokens(ctx, id, tenantID); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return cancelled, nil
}

// DeleteSession removes a session. Sessions in ACTIVE or COMPLETED state are
// protected (their data is operationally live or archived) and cannot be deleted;
// callers must cancel an ACTIVE session first. The underlying delete is a hard
// delete so FK cascades to stages/groups/participants fire.
func (u *SessionUsecase) DeleteSession(ctx context.Context, id, tenantID string) error {
	s, err := u.sessionRepo.GetSessionByID(ctx, id, tenantID)
	if err != nil {
		return err
	}
	if s.Status == entity.SessionActive || s.Status == entity.SessionCompleted {
		return apperrors.Conflict("session_not_deletable", nil)
	}
	return u.sessionRepo.DeleteSession(ctx, id)
}

// GetStages lists the session Topik. The owning session is verified against
// tenantID first so cross-tenant session IDs surface as 404 (§5.A).
func (u *SessionUsecase) GetStages(ctx context.Context, sessionID, tenantID string) ([]entity.SessionStage, error) {
	if _, err := u.sessionRepo.GetSessionByID(ctx, sessionID, tenantID); err != nil {
		return nil, err
	}
	return u.sessionRepo.ListSessionStages(ctx, sessionID)
}

// CreateGroup creates a new session group. The owning session is verified
// against tenantID first so cross-tenant session IDs surface as 404 (§5.A,
// mirror GetGroups): a non-empty tenant must own the session, otherwise the
// repo returns not_found and nothing is created. An empty tenantID stays
// unscoped (tenant-less SUPER_ADMIN passthrough, same contract as
// GetSessionByID).
func (u *SessionUsecase) CreateGroup(ctx context.Context, sessionID, tenantID, name string) (*entity.SessionGroup, error) {
	if _, err := u.sessionRepo.GetSessionByID(ctx, sessionID, tenantID); err != nil {
		return nil, err
	}
	g := &entity.SessionGroup{
		SessionID: sessionID,
		Name:      name,
		Status:    entity.GroupWaiting,
	}
	if err := u.sessionRepo.CreateSessionGroup(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

// UpdateGroup patches a session group's name/status/facilitator.
// A nil facilitatorID clears the facilitator (DB NULL); pass a pointer to a
// value to set or keep it.
func (u *SessionUsecase) UpdateGroup(ctx context.Context, groupID, name, status, tenantID string, facilitatorID *string) (*entity.SessionGroup, error) {
	g, err := u.sessionRepo.GetSessionGroupByID(ctx, groupID, tenantID)
	if err != nil {
		return nil, err
	}
	// A non-empty facilitator reference must point at an existing account with
	// the FASILITATOR role — otherwise any user id (admin, deleted user, wrong
	// role) could be attached to a group. Clearing (nil/empty) needs no lookup.
	if facilitatorID != nil && *facilitatorID != "" {
		if u.userRepo == nil {
			return nil, apperrors.Internal("internal_error", nil)
		}
		target, terr := u.userRepo.GetByID(ctx, *facilitatorID)
		if terr != nil {
			if _, code, ok := apperrors.AsAppError(terr); ok && code == "not_found" {
				return nil, apperrors.BadRequest("invalid_facilitator", nil)
			}
			return nil, terr
		}
		if target.Role != entity.RoleFasilitator {
			return nil, apperrors.BadRequest("invalid_facilitator", nil)
		}
	}
	if name != "" {
		g.Name = name
	}
	if status != "" {
		if !isValidGroupStatus(status) {
			return nil, apperrors.BadRequest("validation_error", nil)
		}
		g.Status = entity.GroupStatus(status)
	}
	g.FacilitatorID = facilitatorID
	if err := u.sessionRepo.UpdateSessionGroup(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

// DeleteGroup removes a session group. The group is loaded tenant-scoped
// first so a cross-tenant group ID surfaces as 404 and deletes nothing
// (mirror UpdateGroup); the repo delete itself stays untouched.
func (u *SessionUsecase) DeleteGroup(ctx context.Context, groupID, tenantID string) error {
	if _, err := u.sessionRepo.GetSessionGroupByID(ctx, groupID, tenantID); err != nil {
		return err
	}
	return u.sessionRepo.DeleteSessionGroup(ctx, groupID)
}

// GetGroups lists the session groups. The owning session is verified against
// tenantID first so cross-tenant session IDs surface as 404 (§5.A).
func (u *SessionUsecase) GetGroups(ctx context.Context, sessionID, tenantID string) ([]entity.SessionGroup, error) {
	if _, err := u.sessionRepo.GetSessionByID(ctx, sessionID, tenantID); err != nil {
		return nil, err
	}
	return u.sessionRepo.ListSessionGroups(ctx, sessionID)
}

// GetGroupByID returns one session group, tenant-scoped — used by handlers for
// the existence + tenant + facilitator-ownership pre-check before a mutation.
func (u *SessionUsecase) GetGroupByID(ctx context.Context, groupID, tenantID string) (*entity.SessionGroup, error) {
	return u.sessionRepo.GetSessionGroupByID(ctx, groupID, tenantID)
}

// MaxGroupParticipants caps how many participants a single session group may
// hold. Creating/linking into a group that already has this many members
// fails with 409 group_full; bulk import skips the overflowing rows and
// reports them in ImportResult.Skipped instead of failing the whole batch.
const MaxGroupParticipants = 20

// requireEditableSession loads a session for a participant write and enforces
// that it is still editable (DRAFT or ACTIVE). COMPLETED/CANCELLED sessions
// reject every session-scoped participant write with session_not_editable.
// Standalone (session-less) writes never call this and stay ungated.
func (u *SessionUsecase) requireEditableSession(ctx context.Context, sessionID, tenantID string) (*entity.Session, error) {
	s, err := u.sessionRepo.GetSessionByID(ctx, sessionID, tenantID)
	if err != nil {
		return nil, err
	}
	if s.Status != entity.SessionDraft && s.Status != entity.SessionActive {
		return nil, apperrors.BadRequest("session_not_editable", nil)
	}
	return s, nil
}

// requireGroupInSession rejects a group that does not exist or belongs to a
// different session with 400 invalid_group. It returns the validated group so
// callers can reuse what was already loaded (LinkParticipant feeds the target
// group's Name into the report clone instead of re-reading it). repo is a
// parameter so the import path can validate through its transaction handle.
func requireGroupInSession(ctx context.Context, repo repository.SessionRepository, groupID, sessionID, tenantID string) (*entity.SessionGroup, error) {
	g, err := repo.GetSessionGroupByID(ctx, groupID, tenantID)
	if err != nil {
		if _, code, _ := apperrors.AsAppError(err); code == "not_found" {
			return nil, apperrors.BadRequest("invalid_group", nil)
		}
		return nil, err
	}
	if g.SessionID != sessionID {
		return nil, apperrors.BadRequest("invalid_group", nil)
	}
	return g, nil
}

// groupMemberCount counts the group's CURRENT members for the capacity check
// (group_full): participants whose session/group pointers target
// (sessionID, groupID). It delegates to CountActiveGroupMembers — pointer
// membership only, NO participant_session_memberships history union — so a
// member who has since migrated to another session no longer occupies
// capacity here (audit #10: the old ListParticipants union over-counted and
// rejected links/creates into groups that were not actually full). An empty
// sessionID falls back to the group pointer only. repo is a parameter so the
// import path counts through its transaction handle.
func groupMemberCount(ctx context.Context, repo repository.SessionRepository, sessionID, groupID string) (int, error) {
	return repo.CountActiveGroupMembers(ctx, sessionID, groupID)
}

// CreateParticipant adds a participant to a session (and optional group).
// With sessionID set the session must exist and be DRAFT/ACTIVE, groupID must
// belong to that session, and the group must be under MaxGroupParticipants.
func (u *SessionUsecase) CreateParticipant(ctx context.Context, tenantID, sessionID, groupID, childName string, childAge int, schoolName, parentName, parentPhone, parentEmail string, consentPhoto bool) (*entity.Participant, error) {
	tp := &tenantID
	if tenantID == "" {
		tp = nil
	}
	sid := &sessionID
	if sessionID == "" {
		sid = nil
	}
	var gid *string
	if groupID != "" {
		g := groupID
		gid = &g
	}
	if sessionID != "" {
		if _, err := u.requireEditableSession(ctx, sessionID, tenantID); err != nil {
			return nil, err
		}
		if groupID != "" {
			if _, err := requireGroupInSession(ctx, u.sessionRepo, groupID, sessionID, tenantID); err != nil {
				return nil, err
			}
			n, err := groupMemberCount(ctx, u.sessionRepo, sessionID, groupID)
			if err != nil {
				return nil, err
			}
			if n >= MaxGroupParticipants {
				return nil, apperrors.Conflict("group_full", nil)
			}
		}
	}
	childName = strings.TrimSpace(childName)
	schoolName = strings.TrimSpace(schoolName)
	parentName = strings.TrimSpace(parentName)
	parentEmail = strings.TrimSpace(parentEmail)
	normPhone, perr := phoneutil.Normalize(parentPhone)
	if perr != nil {
		return nil, apperrors.BadRequest("validation_error", perr)
	}
	parentPhone = normPhone
	// Reject duplicate participant names (same tenant) before insert. This is
	// an application-level check — no unique index — so it covers every create
	// path that goes through this usecase (global + session-scoped).
	exists, derr := u.sessionRepo.ParticipantNameExists(ctx, tenantID, childName)
	if derr != nil {
		return nil, derr
	}
	if exists {
		return nil, apperrors.Conflict("participant_duplicate_name", nil)
	}
	p := &entity.Participant{
		TenantID:     tp,
		SessionID:    sid,
		GroupID:      gid,
		ChildName:    childName,
		ChildAge:     childAge,
		SchoolName:   schoolName,
		ParentName:   parentName,
		ParentPhone:  parentPhone,
		ParentEmail:  parentEmail,
		ConsentPhoto: consentPhoto,
	}
	if err := u.sessionRepo.CreateParticipant(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// ImportParticipants bulk-creates participants inside a single transaction.
// Duplicate participants (same child_name + parent_phone within the same program)
// are skipped and reported in the result.
func (u *SessionUsecase) ImportParticipants(ctx context.Context, tenantID, sessionID string, rows []repository.ParticipantInput) (*repository.ImportResult, error) {
	// Sanitize BEFORE the duplicate query below: rows arrive raw ("08…") while
	// stored rows are normalized ("+62…") — dedup must compare uniform forms.
	for i := range rows {
		rows[i].ChildName = strings.TrimSpace(rows[i].ChildName)
		rows[i].SchoolName = strings.TrimSpace(rows[i].SchoolName)
		rows[i].ParentName = strings.TrimSpace(rows[i].ParentName)
		rows[i].ParentEmail = strings.TrimSpace(rows[i].ParentEmail)
		norm, perr := phoneutil.Normalize(rows[i].ParentPhone)
		if perr != nil {
			return nil, apperrors.BadRequest("validation_error", perr)
		}
		rows[i].ParentPhone = norm
	}
	result := &repository.ImportResult{
		Created: make([]entity.Participant, 0, len(rows)),
		Skipped: make([]repository.DuplicateParticipantInfo, 0),
	}
	// Status gate: bulk import is a session-scoped write, so only DRAFT or
	// ACTIVE sessions accept it (session-scoped import always has sessionID).
	if sessionID != "" {
		if _, err := u.requireEditableSession(ctx, sessionID, tenantID); err != nil {
			return nil, err
		}
	}
	err := u.sessionRepo.Transaction(ctx, func(tx repository.SessionRepository) error {
		tp := &tenantID
		if tenantID == "" {
			tp = nil
		}
		sid := &sessionID
		if sessionID == "" {
			sid = nil
		}

		// Every distinct row group must exist and belong to this session;
		// otherwise the row would be silently attached to a foreign group.
		if sessionID != "" {
			checked := make(map[string]bool)
			for _, r := range rows {
				if r.GroupID == nil || *r.GroupID == "" {
					continue
				}
				g := *r.GroupID
				if checked[g] {
					continue
				}
				checked[g] = true
				if _, err := requireGroupInSession(ctx, tx, g, sessionID, tenantID); err != nil {
					return err
				}
			}
		}

		// Resolve the program_id for duplicate detection.
		var programID string
		if sessionID != "" {
			s, serr := tx.GetSessionByID(ctx, sessionID, "")
			if serr == nil {
				programID = s.ProgramID
			}
		}

		// Check for duplicates before creating.
		var dups []repository.DuplicateParticipantInfo
		if programID != "" {
			d, derr := tx.FindDuplicateParticipants(ctx, programID, tenantID, rows)
			if derr != nil {
				return derr
			}
			dups = d
		}

		// Build a set of duplicate keys for O(1) lookup.
		dupKeys := make(map[string]bool, len(dups))
		for _, d := range dups {
			key := d.ChildName + "|" + d.ParentPhone
			dupKeys[key] = true
		}

		// Seed live member counts per referenced group so rows beyond
		// MaxGroupParticipants are skipped instead of overflowing the group.
		groupCounts := make(map[string]int)
		for _, r := range rows {
			if r.GroupID == nil || *r.GroupID == "" {
				continue
			}
			g := *r.GroupID
			if _, seen := groupCounts[g]; !seen {
				n, err := groupMemberCount(ctx, tx, sessionID, g)
				if err != nil {
					return err
				}
				groupCounts[g] = n
			}
		}

		for _, r := range rows {
			key := r.ChildName + "|" + r.ParentPhone
			if dupKeys[key] {
				// Find the matching dup info to include in skipped.
				for _, d := range dups {
					if (d.ChildName + "|" + d.ParentPhone) == key {
						d.Reason = "duplicate"
						result.Skipped = append(result.Skipped, d)
						break
					}
				}
				continue
			}
			var gid *string
			if r.GroupID != nil && *r.GroupID != "" {
				g := *r.GroupID
				// Capacity: report the overflow row as skipped, never as an error.
				if groupCounts[g] >= MaxGroupParticipants {
					result.Skipped = append(result.Skipped, repository.DuplicateParticipantInfo{
						ChildName:   r.ChildName,
						ParentPhone: r.ParentPhone,
						Reason:      "group_full",
					})
					continue
				}
				gid = &g
			}
			p := &entity.Participant{
				TenantID:     tp,
				SessionID:    sid,
				GroupID:      gid,
				ChildName:    r.ChildName,
				ChildAge:     r.ChildAge,
				SchoolName:   r.SchoolName,
				ParentName:   r.ParentName,
				ParentPhone:  r.ParentPhone,
				ParentEmail:  r.ParentEmail,
				ConsentPhoto: r.ConsentPhoto,
			}
			if err := tx.CreateParticipant(ctx, p); err != nil {
				return err
			}
			if gid != nil {
				groupCounts[*gid]++
			}
			result.Created = append(result.Created, *p)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// LinkParticipant attaches an existing participant to a session (and optional group).
// The target session must be DRAFT/ACTIVE, the group (when given) must belong to
// it and have capacity, and a participant already in THIS session is rejected
// with participant_already_in_session instead of being re-linked.
// Migration policy: when the participant already belongs to ANOTHER session,
// the SAME program copies ALL of the source session's facts onto the target —
// the assessments (including star = 0 rows), the attendance rows, the
// same-topic gallery photos (each with its own copied file), and the reports
// (rapor, incl. their participant missions) — followed by the badge reconcile;
// a DIFFERENT program skips every copy step so the target session starts
// scratch (the link itself still happens). Either way, the source membership
// is recorded in participant_session_memberships BEFORE the move, so readers
// of the old session (report generation, group tabs) keep seeing the
// participant. Consent is NEVER migrated (SETIAP SESI WAJIB CONSENT ULANG):
// consent_logs rows stay keyed to the source session, and the denormalized
// participants consent projection (consent_photo/consent_at/combined token) is
// reset before the move so the target session starts with consent_photo=false
// and must collect a fresh parent consent. Every failure (duplicate, missing or foreign-tenant source
// session, clone/carry/snapshot/report-clone failure, history write failure)
// surfaces as an explicit error; nothing is swallowed. If the participant was
// already linked to another session, the previous session info is returned so
// the caller can display migration context.
func (u *SessionUsecase) LinkParticipant(ctx context.Context, sessionID, participantID, groupID, tenantID string) (*repository.LinkParticipantResult, error) {
	// Session-scoped write: closed sessions reject new participants. The loaded
	// target session feeds the same-program migration gate below.
	targetS, err := u.requireEditableSession(ctx, sessionID, tenantID)
	if err != nil {
		return nil, err
	}
	p, err := u.sessionRepo.GetParticipantByID(ctx, participantID, tenantID)
	if err != nil {
		return nil, err
	}
	// Already linked to THIS session: re-linking would silently "migrate" the
	// participant onto itself and re-clone assessments.
	if p.SessionID != nil && *p.SessionID == sessionID {
		return nil, apperrors.Conflict("participant_already_in_session", nil)
	}
	// Capture the explicit target group's Name while the group is validated:
	// the report clone (step 4) runs BEFORE the participant move, so leaving
	// GroupName empty there would make Create denormalize the SOURCE group
	// from participants.group_id (which only flips to the target group in
	// step 6). Empty targetGroupName (no explicit groupID) keeps the plain
	// denormalization path — see cloneReports.
	var targetGroupName string
	if groupID != "" {
		tg, terr := requireGroupInSession(ctx, u.sessionRepo, groupID, sessionID, tenantID)
		if terr != nil {
			return nil, terr
		}
		targetGroupName = tg.Name
		n, err := groupMemberCount(ctx, u.sessionRepo, sessionID, groupID)
		if err != nil {
			return nil, err
		}
		if n >= MaxGroupParticipants {
			return nil, apperrors.Conflict("group_full", nil)
		}
	}

	// Capture the source session before overwrite. The load is tenant-scoped:
	// a missing or foreign-tenant source session is an explicit error, never a
	// silent skip. sameProgram decides below whether the fact-copy steps run:
	// same program → clone/carry from the source; different program → skip
	// every copy so the target session starts scratch, but still link.
	// prevSessionName/prevSessionStatus feed the clone provenance snapshot
	// (the report clones record WHERE they came from — id, name, status at
	// clone time — and the result reports the same identity back to callers).
	var prevSessionID, prevSessionName, prevSessionStatus, prevProgramID string
	sameProgram := false
	if p.SessionID != nil && *p.SessionID != "" {
		prevSessionID = *p.SessionID
		prevS, serr := u.sessionRepo.GetSessionByID(ctx, prevSessionID, tenantID)
		if serr != nil {
			return nil, serr
		}
		prevSessionName = prevS.Name
		prevSessionStatus = string(prevS.Status)
		prevProgramID = prevS.ProgramID
		sameProgram = prevS.ProgramID == targetS.ProgramID
	}

	// Migration structure: steps 1-5 write across DIFFERENT repositories
	// (assessment/attendance/photo/report/mission/badge) that expose no
	// tx-bound handles — SessionRepository is the only repo with a transaction
	// wrapper — so one cross-repo BEGIN/COMMIT would need a repo-wide refactor.
	// Those steps therefore rely on ordering + idempotency: each runs while
	// the participant is still in the source session, and every write either
	// skips already-existing rows or rewrites identical data, so re-running
	// LinkParticipant after a mid-step failure converges (ulangi proses aman).
	// Step 6 (the commit phase: membership history + consent reset + pointer
	// move) is all SessionRepository work and runs inside ONE session-repo
	// transaction, so it can never half-commit. Steps 1-5 run ONLY when
	// sameProgram (a cross-program link skips every copy step so the target
	// session starts scratch); step 6 always runs.
	//  1. Clone ALL source assessments (star = 0 included) onto the target
	//     session's Kegiatan leaves — a failure aborts while the participant is
	//     still in the source session.
	//  2. Carry the attendance rows (idempotent upsert on participant+session).
	//  3. Snapshot the gallery photos: each same-topic source photo is copied
	//     to the target session WITH its own file copy under UploadDir
	//     (deterministic target path derived from the source row ID), so
	//     deleting a photo in one session never unlinks the other session's
	//     file. A missing source file skips that row (data condition, logged);
	//     a copy I/O error aborts before the participant move. Retry converges
	//     because the natural-key check (target row already holding the
	//     deterministic path) skips photos copied by a previous attempt.
	//  4. Clone the reports (rapor) WITH their participant_missions: each
	//     source report maps 1:1 onto the same program_stage_id in the target
	//     session (legacy whole-session rows keyed by ""), the copy gets a
	//     FRESH parent token, status downgraded to DRAFT (the source's
	//     APPROVED/SENT/PENDING_REVIEW state is never inherited and the source
	//     row stays untouched), sent_at = nil (never delivered yet) and empty
	//     gallery tokens — plus a provenance snapshot of the source session
	//     (id/name/status) — and an occupied target slot — indexed up front or
	//     reported by uq_reports_session_participant_topic as a conflict — is
	//     skipped, so a retry converges. A failure aborts while the
	//     participant is still in the source session.
	//  5. Reconcile the FINAL badge (same-program migration only): the program
	//     may have grown Topik since the badge was earned — RecomputeFinalBadge
	//     is the shared reconcile point (award iff every Topik has its TOPIK
	//     badge, revoke a stale FINAL otherwise) and never touches TOPIK
	//     rows, which are program-scoped and carry automatically. A failure
	//     aborts while the participant is still in the source session.
	//  6. Record the SOURCE membership (participant_session_memberships) and
	//     move the participant LAST — the commit step, wrapped in ONE
	//     session-repo transaction together with the consent reset (see below),
	//     so the three writes succeed or fail as a unit. If it fails after
	//     1/2/3/4/5, a retry converges because the clone skips already-existing
	//     rows, the attendance upsert is idempotent, the photo copy skips
	//     already-copied rows, the report clone skips occupied slots (missions
	//     are replaced, not appended), the badge reconcile is idempotent, and
	//     the history record is an idempotent insert.
	if sameProgram {
		if err := u.cloneScoredAssessments(ctx, participantID, prevSessionID, sessionID, tenantID); err != nil {
			return nil, err
		}
		if err := u.carryAttendance(ctx, participantID, prevSessionID, sessionID, tenantID); err != nil {
			return nil, err
		}
		if err := u.copySessionPhotos(ctx, participantID, prevSessionID, sessionID, tenantID); err != nil {
			return nil, err
		}
		if err := u.cloneReports(ctx, participantID, prevSessionID, prevSessionName, prevSessionStatus, sessionID, tenantID, targetGroupName); err != nil {
			return nil, err
		}
		if u.badgeReconciler != nil && prevSessionID != "" {
			if _, err := u.badgeReconciler.RecomputeFinalBadge(ctx, participantID, targetS.ProgramID); err != nil {
				return nil, fmt.Errorf("link_participant: reconcile badges participant=%s program=%s: %w", participantID, targetS.ProgramID, err)
			}
		}
	}

	// COMMIT PHASE (step 6) — ONE session-repo transaction. Membership history,
	// the consent reset and the pointer move all go through SessionRepository,
	// the only repository exposing Transaction, so they commit together: a
	// failure rolls all three back instead of leaving membership recorded
	// without the move, or a cleared consent on a participant that never left
	// the source session.
	//
	// History write (isolation): record the SOURCE membership in the single
	// place that severs the old pointer — right before the move below. The
	// record is idempotent (UNIQUE participant_id+session_id), and the earlier
	// participant_already_in_session guard guarantees prevSessionID is never
	// the target session.
	//
	// Consent invariant — SETIAP SESI WAJIB CONSENT ULANG: consent is keyed per
	// (participant, session) in consent_logs, so NOTHING of it travels with the
	// move. The denormalized participants.consent_* projection belongs to the
	// SOURCE session only and is reset HERE, inside the same transaction as the
	// move — while a participant that moved with a stale projection would claim
	// granted consent it never gave in the target. The reset mirrors exactly what
	// RespondCombined writes on grant (consent_handler): consent_photo,
	// consent_at and the combined token pair — so after migration the
	// participant reports consent_photo=false (every facilitator guard goes
	// honest), the target session has no consent of any kind, and the old
	// session's parent link (token) can never grant into the new session.
	// Persistence uses the map-based UpdateParticipantFields, NOT the move's
	// struct-based UpdateParticipant: GORM skips zero-value struct fields, so
	// false/nil would never reach the DB (the C2 zero-value bug).
	if err := u.sessionRepo.Transaction(ctx, func(tx repository.SessionRepository) error {
		if prevSessionID != "" {
			m := &entity.ParticipantSessionMembership{
				TenantID:      p.TenantID,
				ParticipantID: participantID,
				SessionID:     prevSessionID,
				GroupID:       p.GroupID,
			}
			if err := tx.RecordMembership(ctx, m); err != nil {
				return err
			}
		}

		p.ConsentPhoto = false
		p.ConsentAt = nil
		p.ConsentCombinedToken = nil
		p.ConsentCombinedTokenExpiresAt = nil
		if err := tx.UpdateParticipantFields(ctx, participantID, map[string]interface{}{
			"consent_photo":                     false,
			"consent_at":                        nil,
			"consent_combined_token":            nil,
			"consent_combined_token_expires_at": nil,
		}); err != nil {
			return err
		}

		sid := sessionID
		p.SessionID = &sid
		if groupID != "" {
			g := groupID
			p.GroupID = &g
		}
		return tx.UpdateParticipant(ctx, p)
	}); err != nil {
		return nil, err
	}
	return &repository.LinkParticipantResult{
		Participant:         *p,
		PreviousSessionID:   prevSessionID,
		PreviousSessionName: prevSessionName,
		PreviousProgramID:   prevProgramID,
	}, nil
}

// GetParticipantsForProgram returns all participants linked to sessions of the
// given program, enriched with session context.
func (u *SessionUsecase) GetParticipantsForProgram(ctx context.Context, programID, tenantID string) ([]repository.ParticipantSessionInfo, error) {
	return u.sessionRepo.ListParticipantsForProgram(ctx, programID, tenantID)
}

// FindParticipantSessionInfo returns session context for a batch of participant IDs.
func (u *SessionUsecase) FindParticipantSessionInfo(ctx context.Context, participantIDs []string, tenantID string) ([]repository.ParticipantSessionInfo, error) {
	return u.sessionRepo.FindParticipantSessionInfo(ctx, participantIDs, tenantID)
}

// UpdateParticipant patches a participant's fields. The participant is loaded
// tenant-scoped (a non-empty tenant must own it, otherwise not_found), the
// owning session gate runs WITH the real tenant (cross-tenant sessions surface
// as 404), and an explicit group move re-runs the group∈session/capacity
// triple from Create/Link (invalid_group / group_full). GroupID is a plain
// string like every sibling participant write: "" means absent (keep) — no
// explicit-clear semantics exist anywhere on this path, so none is invented
// here (mirror siblings; a nil GroupID stays nil).
func (u *SessionUsecase) UpdateParticipant(ctx context.Context, tenantID, participantID, childName string, childAge int, schoolName, parentName, parentPhone, parentEmail, groupID string, consentPhoto bool, hasAge bool) (*entity.Participant, error) {
	p, err := u.sessionRepo.GetParticipantByID(ctx, participantID, tenantID)
	if err != nil {
		return nil, err
	}
	// Audit #13b: a profile write on a participant who still points at a
	// session is a session-scoped write — only DRAFT/ACTIVE sessions accept
	// it; COMPLETED/CANCELLED reject with session_not_editable (the old path
	// wrote straight through). Standalone (session-less) participants stay
	// ungated, like every other session-less participant write. The gate runs
	// with the caller's tenant (not unscoped) so a cross-tenant session
	// surfaces as 404 instead of passing status-only.
	var sessionID string
	if p.SessionID != nil && *p.SessionID != "" {
		sessionID = *p.SessionID
		if _, err := u.requireEditableSession(ctx, sessionID, tenantID); err != nil {
			return nil, err
		}
	}
	if groupID != "" && sessionID != "" {
		if _, err := requireGroupInSession(ctx, u.sessionRepo, groupID, sessionID, tenantID); err != nil {
			return nil, err
		}
		if p.GroupID == nil || *p.GroupID != groupID {
			n, err := groupMemberCount(ctx, u.sessionRepo, sessionID, groupID)
			if err != nil {
				return nil, err
			}
			if n >= MaxGroupParticipants {
				return nil, apperrors.Conflict("group_full", nil)
			}
		}
	}
	childName = strings.TrimSpace(childName)
	schoolName = strings.TrimSpace(schoolName)
	parentName = strings.TrimSpace(parentName)
	parentEmail = strings.TrimSpace(parentEmail)
	parentPhone = strings.TrimSpace(parentPhone)
	if parentPhone != "" {
		norm, perr := phoneutil.Normalize(parentPhone)
		if perr != nil {
			return nil, apperrors.BadRequest("validation_error", perr)
		}
		parentPhone = norm
	}
	if childName != "" {
		p.ChildName = childName
	}
	if hasAge {
		p.ChildAge = childAge
	}
	if schoolName != "" {
		p.SchoolName = schoolName
	}
	if parentName != "" {
		p.ParentName = parentName
	}
	if parentPhone != "" {
		p.ParentPhone = parentPhone
	}
	if parentEmail != "" {
		p.ParentEmail = parentEmail
	}
	if groupID != "" {
		g := groupID
		p.GroupID = &g
	}
	if consentPhoto {
		p.ConsentPhoto = true
	}
	if err := u.sessionRepo.UpdateParticipant(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// GetParticipants lists participants for a session (optionally filtered by group),
// tenant-scoped.
func (u *SessionUsecase) GetParticipants(ctx context.Context, sessionID, groupID, tenantID string) ([]entity.Participant, error) {
	return u.sessionRepo.ListParticipants(ctx, sessionID, groupID, tenantID)
}

// ListParticipantsGlobal lists participants across the caller's tenant scope with
// optional session_id/group_id filters plus pagination and search. tenantID is the
// resolved tenant from context ("" for tenant-less SUPER_ADMIN scoped calls is allowed
// only when sessionID/groupID narrow the query).
func (u *SessionUsecase) ListParticipantsGlobal(ctx context.Context, tenantID, sessionID, groupID, search string, page, limit int) (*repository.Paginated[entity.Participant], error) {
	return u.sessionRepo.ListParticipantsPaginated(ctx, tenantID, sessionID, groupID, search, page, limit)
}

// GetParticipantGlobal returns a single participant by id, tenant-scoped.
func (u *SessionUsecase) GetParticipantGlobal(ctx context.Context, participantID, tenantID string) (*entity.Participant, error) {
	return u.sessionRepo.GetParticipantGlobal(ctx, participantID, tenantID)
}

// DeleteParticipant removes a participant. The repository refuses participants
// still linked to a session/group or carrying child records. tenantID, when
// non-empty, must match the participant's tenant (the repository delete itself
// is by ID only, so the scope is enforced here).
func (u *SessionUsecase) DeleteParticipant(ctx context.Context, participantID, tenantID string) error {
	if tenantID != "" {
		if _, err := u.sessionRepo.GetParticipantByID(ctx, participantID, tenantID); err != nil {
			return err
		}
	}
	return u.sessionRepo.DeleteParticipant(ctx, participantID)
}

// EnsureSessionSubstages guarantees a session has its Kegiatan leaves
// (session Kegiatan) cloned from the program, so per-leaf flows always have
// data to render. Sessions created before Kegiatan cloning
// landed (or whose clone was skipped) would otherwise show empty data.
// Idempotent: when session Kegiatan already exist it returns immediately.
// No-op when the Kegiatan repos are unwired.
func (u *SessionUsecase) EnsureSessionSubstages(ctx context.Context, sessionID string) error {
	if u.programSubstages == nil || u.sessionSubstages == nil {
		return nil
	}
	existing, err := u.sessionSubstages.ListSessionSubstages(ctx, sessionID)
	if err != nil {
		return err
	}
	if len(existing) > 0 {
		return nil
	}
	s, gerr := u.sessionRepo.GetSessionByID(ctx, sessionID, "")
	if gerr != nil {
		return gerr
	}
	return u.cloneSubstages(ctx, sessionID, s.ProgramID)
}

// cloneSubstages materializes one session Kegiatan row (status WAITING) per
// program Kegiatan of every cloned session Topik. It lists the freshly created
// session Topik for the session, then for each Topik's Kegiatan creates
// a WAITING session Kegiatan under the matching session Topik. Idempotent: a
// duplicate-key conflict (unique (session_id, program_substage_id)) is ignored.
func (u *SessionUsecase) cloneSubstages(ctx context.Context, sessionID, programID string) error {
	programStages, err := u.programStages.ListStages(ctx, programID)
	if err != nil {
		return err
	}
	sessionStages, err := u.sessionRepo.ListSessionStages(ctx, sessionID)
	if err != nil {
		return err
	}
	for _, ps := range programStages {
		var ssID string
		for i := range sessionStages {
			if sessionStages[i].ProgramStageID == ps.ID {
				ssID = sessionStages[i].ID
				break
			}
		}
		if ssID == "" {
			continue
		}
		subs, serr := u.programSubstages.ListSubstages(ctx, ps.ID)
		if serr != nil {
			return serr
		}
		for i := range subs {
			sub := subs[i]
			ssub := &entity.SessionSubstage{
				SessionID:         sessionID,
				SessionStageID:    ssID,
				ProgramSubstageID: sub.ID,
				Status:            entity.SessionSubstageWaiting,
			}
			if cerr := u.sessionSubstages.CreateSessionSubstage(ctx, ssub); cerr != nil {
				if isConflict(cerr) {
					continue
				}
				return cerr
			}
		}
	}
	return nil
}

// cloneScoredAssessments copies ALL of the old participant's assessments from
// the previous session onto the same participant in the new session
// (LinkParticipant moves the participant, not a different child). Every row is
// carried — including star = 0 rows — so an unscored Kegiatan in the source
// stays explicitly unscored in the target and the participant remains
// re-scored-able there. Each old session_substage is resolved to its
// program_substage, then mapped to the new session's session_substage (same
// Kegiatan leaf), so cloned rows always carry TARGET-session substage IDs (the
// unique (participant, session_substage) key never collides with source rows).
// tenantID scopes the source read (required by the assessment repo). Any
// failure — list, substage remap, create — is returned to the caller; only a
// duplicate-key conflict (target row already exists, e.g. a retry after a
// partially applied migration) is logged and skipped for idempotency.
// Provenance: every clone stamps SourceSessionID = oldSessionID (the session
// it was copied from); natively created assessments keep nil.
func (u *SessionUsecase) cloneScoredAssessments(ctx context.Context, participantID, oldSessionID, newSessionID, tenantID string) error {
	if u.assessmentRepo == nil || u.sessionSubstages == nil || oldSessionID == "" {
		return nil
	}
	scored, err := u.assessmentRepo.List(ctx, repository.AssessmentFilter{
		ParticipantID: participantID,
		SessionID:     oldSessionID,
		TenantID:      tenantID,
	}, 1, 1000)
	if err != nil {
		return err
	}
	for i := range scored.Items {
		a := scored.Items[i]
		oldSub, gerr := u.sessionSubstages.GetSessionSubstage(ctx, a.SessionSubstageID)
		if gerr != nil {
			return gerr
		}
		newSub, nerr := u.sessionSubstages.GetSessionSubstageByKeys(ctx, newSessionID, oldSub.ProgramSubstageID)
		if nerr != nil {
			return nerr
		}
		clone := &entity.Assessment{
			ParticipantID:     participantID,
			SessionID:         newSessionID,
			SessionSubstageID: newSub.ID,
			StarRating:        a.StarRating,
			Comment:           a.Comment,
			AssessedBy:        a.AssessedBy,
			AssessedAt:        a.AssessedAt,
			// Provenance: this row is a CLONE from oldSessionID.
			SourceSessionID: new(oldSessionID),
		}
		if cerr := u.assessmentRepo.Create(ctx, clone); cerr != nil {
			if isConflict(cerr) {
				log.Printf("link_participant: skip existing assessment clone participant=%s session_substage=%s", participantID, newSub.ID)
				continue
			}
			return cerr
		}
	}
	return nil
}

// reportCloneListLimit caps one List page during the report clone, mirroring
// cloneScoredAssessments' 1000-row source read (photoSnapshotListLimit keeps
// the same precedent for photos): a participant with more reports than this in
// one session is beyond the precedent the other clone steps already set.
const reportCloneListLimit = 1000

// cloneReports copies the participant's reports (rapor) from the source
// session to the target session during LinkParticipant, and mirrors each
// copied report's participant_missions onto the clone. Reports are keyed per
// (participant, session, program_stage), so topic identity bridges through
// program_stage_id directly — no session-stage remap is needed (unlike
// attendance/photos): a source row maps 1:1 onto the same program_stage_id in
// the target session, and a legacy whole-session row (empty program_stage_id)
// maps onto the target's legacy slot.
//
// The copy keeps the report's CONTENT — ProgramStageID, AINarrativeDraft,
// AINarrativeFinal, GeneratedAt, ApprovedBy, ReportPDFURL — but it is a NEW
// delivery in the target session, so review/delivery state resets:
//   - Status = DRAFT for EVERY clone, whatever the source's status (SENT,
//     APPROVED, PENDING_REVIEW, …): the copy must be re-reviewed and re-sent
//     in the target session and can never appear there as already delivered
//     or approved. The source row keeps its own status untouched.
//   - SentAt = nil: the copy has never been delivered, so it stays
//     re-sendable; the source row keeps its own delivery history;
//   - ParentAccessToken = fresh util.RandomToken (the helper GetOrCreateDraft
//     uses): two reports sharing one token would make GetByToken ambiguous,
//     and one session's parent link must not open the other session's copy.
//     The source's ParentTokenExpiresAt/ParentTokenRevoked belong to the OLD
//     token — copying them would hand the fresh token a pre-expired or
//     pre-revoked state — so they reset to the fresh-token defaults (nil/false);
//   - GalleryAccessToken/GalleryTokenExpiresAt/GalleryTokenRevoked reset
//     likewise: the gallery QR is re-minted on demand by the gallery-token
//     endpoint for the copy, never inherited from the source;
//   - GroupName takes LinkParticipant's explicit target group name when one
//     was given: the clone runs BEFORE the participant move, so an empty value
//     would make Create denormalize the SOURCE group off participants.group_id
//     (which only flips to the target group in the move step). Without an
//     explicit group (groupID == "") it stays empty and Create denormalizes as
//     usual — the participant keeps pointing at the same group, so that value
//     is correct by definition.
//
// Provenance: every clone stamps SourceSessionID/SourceSessionName/
// SourceSessionStatus with the source session's id and a SNAPSHOT of its
// name+status taken by LinkParticipant at clone time (no re-resolve at read
// time, so the label survives a later hard delete of the source session);
// natively created reports keep all three nil (JSON null).
//
// Ordering/idempotency (LinkParticipant step 4, before the participant moves):
// the target session's active reports are read once and indexed by
// program_stage_id — an occupied slot means a previous (possibly partially
// failed) attempt already copied that topic, so it is skipped; a row that List
// cannot see (soft-deleted tombstone still holding the physical unique slot)
// surfaces from Create as a conflict app-error, also skipped. The real DB
// enforces uq_reports_session_participant_topic after migration 000010, so
// Create conflicts converge the same way. Missions copy through
// ReplaceByReport (atomic delete + insert) — re-running overwrites with
// identical rows instead of duplicating. Optional deps: unwired repos (either
// nil) skip cloning entirely, like the other optional LinkParticipant steps.
func (u *SessionUsecase) cloneReports(ctx context.Context, participantID, oldSessionID, sourceSessionName, sourceSessionStatus, newSessionID, tenantID, targetGroupName string) error {
	if u.reportRepo == nil || u.missionRepo == nil || oldSessionID == "" {
		return nil
	}
	srcRes, err := u.reportRepo.List(ctx, repository.ReportFilter{
		ParticipantID: participantID,
		SessionID:     oldSessionID,
		TenantID:      tenantID,
	}, 1, reportCloneListLimit)
	if err != nil {
		return err
	}
	if len(srcRes.Items) == 0 {
		return nil
	}
	dstRes, err := u.reportRepo.List(ctx, repository.ReportFilter{
		ParticipantID: participantID,
		SessionID:     newSessionID,
		TenantID:      tenantID,
	}, 1, reportCloneListLimit)
	if err != nil {
		return err
	}
	// Active target rows by program_stage_id ("" = legacy whole-session row).
	// List hides soft-deleted tombstones, but their physical unique slot is
	// still held — Create on such a slot conflicts and is skipped below.
	dstByStage := make(map[string]entity.Report, len(dstRes.Items))
	for i := range dstRes.Items {
		dstByStage[dstRes.Items[i].ProgramStageID] = dstRes.Items[i]
	}

	for i := range srcRes.Items {
		src := srcRes.Items[i]
		dst, slotTaken := dstByStage[src.ProgramStageID]
		if !slotTaken {
			tok, terr := util.RandomToken()
			if terr != nil {
				return fmt.Errorf("link_participant: mint parent token for report clone participant=%s program_stage=%s: %w", participantID, src.ProgramStageID, terr)
			}
			clone := &entity.Report{
				ParticipantID:  participantID,
				SessionID:      newSessionID,
				ProgramStageID: src.ProgramStageID,
				// Content carried as-is; review state reset (see doc comment).
				AINarrativeDraft: src.AINarrativeDraft,
				AINarrativeFinal: src.AINarrativeFinal,
				// ALWAYS DRAFT — a clone must never inherit the source's
				// APPROVED/SENT/PENDING_REVIEW state (audit point #7); the
				// source row itself is never written here.
				Status:       entity.ReportDraft,
				GeneratedAt:  src.GeneratedAt,
				ApprovedBy:   src.ApprovedBy,
				ReportPDFURL: src.ReportPDFURL,
				// Provenance snapshot (see doc comment): which session this
				// report was cloned from, with its name+status at clone time.
				SourceSessionID:     new(oldSessionID),
				SourceSessionName:   new(sourceSessionName),
				SourceSessionStatus: new(sourceSessionStatus),
				// Explicit target group wins (Create only denormalizes an
				// empty GroupName); "" keeps the denorm path — see doc.
				GroupName:         targetGroupName,
				ParentAccessToken: tok,
				// SentAt stays nil: the copy is undelivered and must remain
				// re-sendable. Parent token expiry/revoked and every gallery
				// token field stay at fresh-token defaults (nil/false) — they
				// describe the SOURCE's tokens, not this new link (see doc).
			}
			if cerr := u.reportRepo.Create(ctx, clone); cerr != nil {
				if isConflict(cerr) {
					// Slot physically occupied but invisible to List
					// (tombstone/race): the pre-existing row keeps its own
					// missions — skip this topic entirely for convergence.
					log.Printf("link_participant: skip existing report clone participant=%s session=%s program_stage=%s", participantID, newSessionID, src.ProgramStageID)
					continue
				}
				return cerr
			}
			dst = *clone
		}

		// Missions follow the target row (freshly created OR already present
		// from a previous attempt — ReplaceByReport converges both).
		srcMissions, merr := u.missionRepo.GetByReport(ctx, tenantID, src.ID)
		if merr != nil {
			return merr
		}
		if len(srcMissions) > 0 {
			items := make([]entity.ParticipantMission, 0, len(srcMissions))
			for j := range srcMissions {
				items = append(items, entity.ParticipantMission{
					// ReportID retargeted to the clone; ID left zero so the
					// repo's BeforeCreate mints a fresh primary key.
					ReportID:      dst.ID,
					MissionBankID: srcMissions[j].MissionBankID,
					IsCompleted:   srcMissions[j].IsCompleted,
					CompletedAt:   srcMissions[j].CompletedAt,
				})
			}
			if rerr := u.missionRepo.ReplaceByReport(ctx, tenantID, dst.ID, items); rerr != nil {
				return rerr
			}
		}
	}
	return nil
}

// sessionStageMaps builds the two remap tables the LinkParticipant carry steps
// share to translate a source session's session_stages rows onto the target
// session's rows through the shared program_stage identity:
//
//	programOfOld    : source session_stage_id → program_stage_id
//	targetByProgram : program_stage_id → target session_stage_id
//
// The same-program gate upstream guarantees both sessions instantiate the same
// program's Topik. When a target session accidentally has duplicate stages for
// one Topik, the first row wins deterministically (mirrors how CreateSession
// instantiates stages in program order). Used by carryAttendance (attendance
// rows) and copySessionPhotos (gallery snapshot) — the mapping logic exists in
// exactly one place.
func (u *SessionUsecase) sessionStageMaps(ctx context.Context, oldSessionID, newSessionID string) (programOfOld, targetByProgram map[string]string, err error) {
	oldStages, err := u.sessionRepo.ListSessionStages(ctx, oldSessionID)
	if err != nil {
		return nil, nil, err
	}
	newStages, err := u.sessionRepo.ListSessionStages(ctx, newSessionID)
	if err != nil {
		return nil, nil, err
	}
	programOfOld = make(map[string]string, len(oldStages))
	for i := range oldStages {
		programOfOld[oldStages[i].ID] = oldStages[i].ProgramStageID
	}
	targetByProgram = make(map[string]string, len(newStages))
	for i := range newStages {
		if _, dup := targetByProgram[newStages[i].ProgramStageID]; !dup {
			targetByProgram[newStages[i].ProgramStageID] = newStages[i].ID
		}
	}
	return programOfOld, targetByProgram, nil
}

// carryAttendance copies the participant's attendance rows from the source
// session to the target session during LinkParticipant. Attendance is
// per-Topik: every source row is remapped onto the target session's
// session_stage with the same program_stage (same-program gate guarantees the
// program matches; the target normally instantiates the same Topics).
// A source row whose Topik has no counterpart in the target session is an
// explicit error (dropping audit rows silently would lose data). A missing
// source row set means there is nothing to carry and is not an error; every
// other failure is returned so the migration aborts before the participant
// moves. Each write is an Upsert keyed on
// (participant, session, session_stage), keeping retries idempotent.
// Legacy session-wide rows (empty session_stage_id, pre-backfill) carry as-is.
// Provenance: every carried row stamps SourceSessionID = oldSessionID (the
// session it was copied from); natively created rows keep nil.
func (u *SessionUsecase) carryAttendance(ctx context.Context, participantID, oldSessionID, newSessionID, tenantID string) error {
	if u.attendanceRepo == nil || oldSessionID == "" {
		return nil
	}
	srcRows, err := u.attendanceRepo.ListByParticipantSession(ctx, participantID, oldSessionID, tenantID)
	if err != nil {
		return err
	}
	if len(srcRows) == 0 {
		return nil
	}
	programOfOld, targetByProgram, err := u.sessionStageMaps(ctx, oldSessionID, newSessionID)
	if err != nil {
		return err
	}
	for i := range srcRows {
		src := srcRows[i]
		dstStageID := ""
		if src.SessionStageID != "" {
			programStageID, ok := programOfOld[src.SessionStageID]
			if !ok {
				return fmt.Errorf("link_participant: cannot carry attendance participant=%s: source stage %s not found in session %s", participantID, src.SessionStageID, oldSessionID)
			}
			dstStageID, ok = targetByProgram[programStageID]
			if !ok {
				return fmt.Errorf("link_participant: cannot carry attendance participant=%s: program stage %s has no session stage in target session %s", participantID, programStageID, newSessionID)
			}
		}
		dst := &entity.ParticipantAttendance{
			ParticipantID:  participantID,
			SessionID:      newSessionID,
			SessionStageID: dstStageID,
			IsPresent:      src.IsPresent,
			MarkedAt:       src.MarkedAt,
			MarkedBy:       src.MarkedBy,
			// Provenance: this row is CARRIED from oldSessionID.
			SourceSessionID: new(oldSessionID),
		}
		if uerr := u.attendanceRepo.Upsert(ctx, dst); uerr != nil {
			return uerr
		}
	}
	return nil
}

// firstUngradedGroup reports whether the session has an ungraded PRESENT
// participant. It returns the name of the first group containing an ungraded
// present participant (empty when every present participant across every
// group is fully graded). A participant is "fully graded" when a scored
// assessment (star_rating >= 1) exists for every session Kegiatan leaf of the
// session. Participants without an attendance row (belum absen) and
// explicitly absent participants are exempt — they are not required to be
// graded and never block completion; an unwired attendance repo conservatively
// grades everyone (the pre-attendance rule). tenantID is the session's tenant
// used to scope the lookups (empty only when the session itself is
// tenant-less).
func (u *SessionUsecase) firstUngradedGroup(ctx context.Context, sessionID, tenantID string) (string, error) {
	if u.assessmentRepo == nil || u.sessionSubstages == nil {
		// Repos unwired (defensive): do not block completion when we cannot verify.
		return "", nil
	}
	groups, gerr := u.sessionRepo.ListSessionGroups(ctx, sessionID)
	if gerr != nil {
		return "", gerr
	}
	subs, serr := u.sessionSubstages.ListSessionSubstages(ctx, sessionID)
	if serr != nil {
		return "", serr
	}
	subIDs := make([]string, 0, len(subs))
	for i := range subs {
		subIDs = append(subIDs, subs[i].ID)
	}
	// Present set for the attendance-aware gate: participant IDs with an
	// explicit is_present=true row in ANY Topik. Attendance is per-Topik, so
	// one participant may own several rows: a single true row marks them
	// present (fail-closed), all-false means explicitly absent (exempt), and
	// no row means unmarked (exempt). A nil map (repo unwired) means every
	// participant is checked (fail-closed, pre-attendance behavior).
	// Session completion closes the whole session, so no per-Topik narrowing
	// applies here: any presence requires full grading on every leaf.
	var present map[string]bool
	if u.attendanceRepo != nil {
		rows, aerr := u.attendanceRepo.ListBySession(ctx, sessionID, tenantID)
		if aerr != nil {
			return "", fmt.Errorf("session: list attendance session=%s: %w", sessionID, aerr)
		}
		present = make(map[string]bool, len(rows))
		for i := range rows {
			if rows[i].IsPresent {
				present[rows[i].ParticipantID] = true
			} else if _, ok := present[rows[i].ParticipantID]; !ok {
				present[rows[i].ParticipantID] = false
			}
		}
	}
	for i := range groups {
		participants, perr := u.sessionRepo.ListParticipants(ctx, sessionID, groups[i].ID, "")
		if perr != nil {
			return "", perr
		}
		for j := range participants {
			if present != nil && !present[participants[j].ID] {
				// Unmarked (belum absen) or explicitly absent → exempt from the gate.
				continue
			}
			if !u.participantFullyGraded(ctx, participants[j].ID, subIDs, tenantID) {
				return groups[i].Name, nil
			}
		}
	}
	return "", nil
}

// participantFullyGraded reports whether the participant has a scored assessment
// for every one of the given session Kegiatan leaves. It reads the exact unique
// slot (participant_id, session_substage_id) — the same lookup the assessment
// upsert writes — scoped to the session's tenant (an empty tenantID skips the
// tenant scope for tenant-less sessions).
func (u *SessionUsecase) participantFullyGraded(ctx context.Context, participantID string, sessionSubstageIDs []string, tenantID string) bool {
	if len(sessionSubstageIDs) == 0 {
		// No Kegiatan leaves => nothing to grade. Treat as fully graded.
		return true
	}
	for k := range sessionSubstageIDs {
		a, lerr := u.assessmentRepo.GetByParticipantStage(ctx, participantID, sessionSubstageIDs[k], tenantID)
		if lerr != nil {
			// NotFound => never graded; any lookup error => grading cannot be
			// proven, so treat as ungraded.
			return false
		}
		if a.StarRating < 1 {
			return false
		}
	}
	return true
}

// firstPendingFacilitatorGroup reports whether any Kelompok containing a
// PRESENT peserta has not been marked COMPLETED by its facilitator. It
// returns the name of the first such group (empty when every group holding
// a present participant is completed). Call it only AFTER the grading gate
// passed, so present participants are already fully graded. Attendance uses
// the same fail-closed semantics as firstUngradedGroup: a nil map (repo
// unwired) treats every participant as present. Groups whose participants
// are all absent or unmarked are exempt — there is no graded present
// participant to sign off (matches the absent/unmarked completion tests).
func (u *SessionUsecase) firstPendingFacilitatorGroup(ctx context.Context, sessionID, tenantID string) (string, error) {
	groups, gerr := u.sessionRepo.ListSessionGroups(ctx, sessionID)
	if gerr != nil {
		return "", gerr
	}
	var present map[string]bool
	if u.attendanceRepo != nil {
		rows, aerr := u.attendanceRepo.ListBySession(ctx, sessionID, tenantID)
		if aerr != nil {
			return "", fmt.Errorf("session: list attendance session=%s: %w", sessionID, aerr)
		}
		present = make(map[string]bool, len(rows))
		for i := range rows {
			if rows[i].IsPresent {
				present[rows[i].ParticipantID] = true
			} else if _, ok := present[rows[i].ParticipantID]; !ok {
				present[rows[i].ParticipantID] = false
			}
		}
	}
	for i := range groups {
		if groups[i].Status == entity.GroupCompleted {
			continue // Facilitator sign-off exists; nothing to check.
		}
		participants, perr := u.sessionRepo.ListParticipants(ctx, sessionID, groups[i].ID, "")
		if perr != nil {
			return "", perr
		}
		for j := range participants {
			if present == nil || present[participants[j].ID] {
				// Present participant in a group the facilitator has not completed.
				return groups[i].Name, nil
			}
		}
	}
	return "", nil
}

func isValidGroupStatus(s string) bool {
	switch entity.GroupStatus(s) {
	case entity.GroupWaiting, entity.GroupInProgress, entity.GroupCompleted:
		return true
	}
	return false
}

// isConflict reports whether err is an app conflict (duplicate-key) error.
func isConflict(err error) bool {
	if err == nil {
		return false
	}
	if ae, ok := err.(interface{ CodeName() string }); ok {
		return ae.CodeName() == "conflict"
	}
	return false
}

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
// the program has its SUBTOPIK badge and revokes a stale FINAL otherwise.
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

// StartSession transitions a session DRAFT -> ACTIVE (cascades Topik to ACTIVE).
func (u *SessionUsecase) StartSession(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	s, err := u.sessionRepo.GetSessionByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	if s.Status != entity.SessionDraft && s.Status != entity.SessionCancelled {
		return nil, apperrors.Conflict("bad_request", nil)
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
	s.Status = entity.SessionActive
	if err := u.sessionRepo.UpdateSession(ctx, s); err != nil {
		return nil, err
	}
	// Cascade: stages WAITING -> ACTIVE.
	stages, err := u.sessionRepo.ListSessionStages(ctx, id)
	if err != nil {
		return nil, err
	}
	for i := range stages {
		if stages[i].Status == entity.SessionStageWaiting {
			stages[i].Status = entity.SessionStageActive
			now := util.Now()
			stages[i].StartedAt = &now
			if err := u.sessionRepo.UpdateSessionStage(ctx, &stages[i]); err != nil {
				return nil, err
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
			return nil, serr
		}
		if len(subs) > 0 {
			existing, eerr := u.sessionRepo.ListGroupStageProgress(ctx, subs[0].ID)
			if eerr != nil {
				return nil, eerr
			}
			if len(existing) == 0 {
				groups, gerr := u.sessionRepo.ListSessionGroups(ctx, id)
				if gerr != nil {
					return nil, gerr
				}
				for i := range groups {
					for j := range subs {
						if cerr := u.sessionRepo.CreateGroupStageProgress(ctx, &entity.GroupStageProgress{
							GroupID:           groups[i].ID,
							SessionSubstageID: subs[j].ID,
							Status:            entity.ProgressLocked,
						}); cerr != nil {
							return nil, cerr
						}
					}
				}
			}
		}
	}
	return s, nil
}
func (u *SessionUsecase) CompleteSession(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	s, err := u.sessionRepo.GetSessionByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	if s.Status != entity.SessionActive {
		return nil, apperrors.Conflict("bad_request", nil)
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
		return nil, gerr
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
		return nil, apperrors.BadRequest("grading_incomplete", nil)
	}
	s.Status = entity.SessionCompleted
	if err := u.sessionRepo.UpdateSession(ctx, s); err != nil {
		return nil, err
	}
	stages, err := u.sessionRepo.ListSessionStages(ctx, id)
	if err != nil {
		return nil, err
	}
	for i := range stages {
		stages[i].Status = entity.SessionStageCompleted
		now := util.Now()
		stages[i].CompletedAt = &now
		if err := u.sessionRepo.UpdateSessionStage(ctx, &stages[i]); err != nil {
			return nil, err
		}
	}
	groups, err := u.sessionRepo.ListSessionGroups(ctx, id)
	if err != nil {
		return nil, err
	}
	for i := range groups {
		groups[i].Status = entity.GroupCompleted
		if err := u.sessionRepo.UpdateSessionGroup(ctx, &groups[i]); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// CancelSession transitions a session to CANCELLED and cancels its Topik.
func (u *SessionUsecase) CancelSession(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	s, err := u.sessionRepo.GetSessionByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	if s.Status == entity.SessionCompleted {
		return nil, apperrors.Conflict("bad_request", nil)
	}
	s.Status = entity.SessionCancelled
	if err := u.sessionRepo.UpdateSession(ctx, s); err != nil {
		return nil, err
	}
	stages, err := u.sessionRepo.ListSessionStages(ctx, id)
	if err != nil {
		return nil, err
	}
	for i := range stages {
		if stages[i].Status == entity.SessionStageActive {
			stages[i].Status = entity.SessionStageCompleted
			now := util.Now()
			stages[i].CompletedAt = &now
			if err := u.sessionRepo.UpdateSessionStage(ctx, &stages[i]); err != nil {
				return nil, err
			}
		}
	}
	return s, nil
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

// CreateGroup creates a new session group.
func (u *SessionUsecase) CreateGroup(ctx context.Context, sessionID, name string) (*entity.SessionGroup, error) {
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

// DeleteGroup removes a session group.
func (u *SessionUsecase) DeleteGroup(ctx context.Context, groupID, tenantID string) error {
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
// different session with 400 invalid_group. repo is a parameter so the import
// path can validate through its transaction handle.
func requireGroupInSession(ctx context.Context, repo repository.SessionRepository, groupID, sessionID, tenantID string) error {
	g, err := repo.GetSessionGroupByID(ctx, groupID, tenantID)
	if err != nil {
		if _, code, _ := apperrors.AsAppError(err); code == "not_found" {
			return apperrors.BadRequest("invalid_group", nil)
		}
		return err
	}
	if g.SessionID != sessionID {
		return apperrors.BadRequest("invalid_group", nil)
	}
	return nil
}

// groupMemberCount counts participants already assigned to a group. It reuses
// the existing ListParticipants repo helper (group_id filter) rather than a
// dedicated count query; an empty sessionID/tenantID means "count by group
// only", which is the membership definition used by the capacity check.
func groupMemberCount(ctx context.Context, repo repository.SessionRepository, groupID string) (int, error) {
	ps, err := repo.ListParticipants(ctx, "", groupID, "")
	if err != nil {
		return 0, err
	}
	return len(ps), nil
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
			if err := requireGroupInSession(ctx, u.sessionRepo, groupID, sessionID, tenantID); err != nil {
				return nil, err
			}
			n, err := groupMemberCount(ctx, u.sessionRepo, groupID)
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
				if err := requireGroupInSession(ctx, tx, g, sessionID, tenantID); err != nil {
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
				n, err := groupMemberCount(ctx, tx, g)
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
// source and target must be sessions of the SAME program — anything else is a
// 400 program_mismatch before any data is copied. On a valid migration ALL of
// the source session's assessments (including star = 0 rows), the attendance
// rows, and the same-topic gallery photos (each with its own copied file) are
// carried to the target session, and the participant remains re-scored-able
// there. Every failure (duplicate, program mismatch, missing or
// foreign-tenant source session, clone/carry/snapshot failure) surfaces as an
// explicit error; nothing is swallowed. If the participant was already linked
// to another session, the previous session info is returned so the caller can
// display migration context.
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
	if groupID != "" {
		if err := requireGroupInSession(ctx, u.sessionRepo, groupID, sessionID, tenantID); err != nil {
			return nil, err
		}
		n, err := groupMemberCount(ctx, u.sessionRepo, groupID)
		if err != nil {
			return nil, err
		}
		if n >= MaxGroupParticipants {
			return nil, apperrors.Conflict("group_full", nil)
		}
	}

	// Capture the source session before overwrite. The load is tenant-scoped:
	// a missing or foreign-tenant source session is an explicit error, never a
	// silent skip. The program gate runs HERE, before any assessment, attendance
	// or participant write — a cross-program link copies and moves nothing.
	var prevSessionID, prevSessionName, prevProgramID string
	if p.SessionID != nil && *p.SessionID != "" {
		prevSessionID = *p.SessionID
		prevS, serr := u.sessionRepo.GetSessionByID(ctx, prevSessionID, tenantID)
		if serr != nil {
			return nil, serr
		}
		prevSessionName = prevS.Name
		prevProgramID = prevS.ProgramID
		if prevS.ProgramID != targetS.ProgramID {
			return nil, apperrors.BadRequest("program_mismatch", nil)
		}
	}

	// Migration ordering: the repos share no transaction, so failure safety is
	// ordering + idempotency instead of a cross-repo BEGIN/COMMIT.
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
	//  4. Reconcile the FINAL badge (same-program migration only): the program
	//     may have grown Topik since the badge was earned — RecomputeFinalBadge
	//     is the shared reconcile point (award iff every Topik has its SUBTOPIK
	//     badge, revoke a stale FINAL otherwise) and never touches SUBTOPIK
	//     rows, which are program-scoped and carry automatically. A failure
	//     aborts while the participant is still in the source session.
	//  5. Move the participant LAST (the commit step): if it fails after 1/2/3/4,
	//     a retry converges because the clone skips already-existing rows, the
	//     attendance upsert is idempotent, the photo copy skips already-copied
	//     rows, and the badge reconcile is idempotent.
	if err := u.cloneScoredAssessments(ctx, participantID, prevSessionID, sessionID, tenantID); err != nil {
		return nil, err
	}
	if err := u.carryAttendance(ctx, participantID, prevSessionID, sessionID, tenantID); err != nil {
		return nil, err
	}
	if err := u.copySessionPhotos(ctx, participantID, prevSessionID, sessionID, tenantID); err != nil {
		return nil, err
	}
	if u.badgeReconciler != nil && prevSessionID != "" {
		if _, err := u.badgeReconciler.RecomputeFinalBadge(ctx, participantID, targetS.ProgramID); err != nil {
			return nil, fmt.Errorf("link_participant: reconcile badges participant=%s program=%s: %w", participantID, targetS.ProgramID, err)
		}
	}

	sid := sessionID
	p.SessionID = &sid
	if groupID != "" {
		g := groupID
		p.GroupID = &g
	}
	if err := u.sessionRepo.UpdateParticipant(ctx, p); err != nil {
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

// UpdateParticipant patches a participant's fields.
func (u *SessionUsecase) UpdateParticipant(ctx context.Context, participantID, childName string, childAge int, schoolName, parentName, parentPhone, parentEmail, groupID string, consentPhoto bool, hasAge bool) (*entity.Participant, error) {
	p, err := u.sessionRepo.GetParticipantByID(ctx, participantID, "")
	if err != nil {
		return nil, err
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
// (session Kegiatan) cloned from the program, so the kiosk/live monitor always
// have per-leaf content to render. Sessions created before Kegiatan cloning
// landed (or whose clone was skipped) would otherwise show an empty kiosk.
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

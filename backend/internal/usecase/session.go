package usecase

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
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

// SessionUsecase orchestrates session + Topik + groups + participants business logic.
type SessionUsecase struct {
	sessionRepo      repository.SessionRepository
	programStages    ProgramStageReader
	programSubstages ProgramSubstageReader
	sessionSubstages repository.SessionSubstageRepository
	assessmentRepo   repository.AssessmentRepository
	userRepo         repository.UserRepository
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

// SetAssessmentRepo injects the assessment repo used to clone scored assessments
// when a participant migrates to a new session (LinkParticipant).
func (u *SessionUsecase) SetAssessmentRepo(assessmentRepo repository.AssessmentRepository) {
	u.assessmentRepo = assessmentRepo
}

// SetUserRepo injects the user repo used to resolve a group's facilitator name
// for the session detail view (so non-admin callers don't need GET /api/users).
func (u *SessionUsecase) SetUserRepo(userRepo repository.UserRepository) {
	u.userRepo = userRepo
}

// CreateSession creates a new DRAFT session owned by the tenant.
func (u *SessionUsecase) CreateSession(ctx context.Context, tenantID, createdBy string, programID, name, sessionDate, startTime, endTime, location, notes string) (*entity.Session, error) {
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

// UpdateSession patches mutable session fields (and status when provided).
func (u *SessionUsecase) UpdateSession(ctx context.Context, id, tenantID, programID, name, sessionDate, startTime, endTime, location, notes, status string) (*entity.Session, error) {
	s, err := u.sessionRepo.GetSessionByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	if programID != "" {
		s.ProgramID = programID
	}
	if name != "" {
		s.Name = name
	}
	if sessionDate != "" {
		s.SessionDate = sessionDate
	}
	if startTime != "" {
		st := startTime
		s.StartTime = &st
	}
	if endTime != "" {
		et := endTime
		s.EndTime = &et
	}
	if location != "" {
		s.Location = location
	}
	if notes != "" {
		s.Notes = notes
	}
	if status != "" {
		if !isValidSessionStatus(status) {
			return nil, apperrors.BadRequest("validation_error", nil)
		}
		s.Status = entity.SessionStatus(status)
	}
	if err := u.sessionRepo.UpdateSession(ctx, s); err != nil {
		return nil, err
	}
	return s, nil
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
	// for every session Kegiatan before the session can be completed.
	if ungraded, gerr := u.firstUngradedGroup(ctx, id); gerr != nil {
		return nil, gerr
	} else if ungraded != "" {
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

// GetStages lists the session Topik.
func (u *SessionUsecase) GetStages(ctx context.Context, sessionID string) ([]entity.SessionStage, error) {
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

// GetGroups lists the session groups.
func (u *SessionUsecase) GetGroups(ctx context.Context, sessionID string) ([]entity.SessionGroup, error) {
	return u.sessionRepo.ListSessionGroups(ctx, sessionID)
}

// CreateParticipant adds a participant to a session (and optional group).
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
	result := &repository.ImportResult{
		Created: make([]entity.Participant, 0, len(rows)),
		Skipped: make([]repository.DuplicateParticipantInfo, 0),
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

		for _, r := range rows {
			key := r.ChildName + "|" + r.ParentPhone
			if dupKeys[key] {
				// Find the matching dup info to include in skipped.
				for _, d := range dups {
					if (d.ChildName + "|" + d.ParentPhone) == key {
						result.Skipped = append(result.Skipped, d)
						break
					}
				}
				continue
			}
			gid := r.GroupID
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
// If the participant was already linked to another session, the previous session info
// is returned so the caller can display migration context.
func (u *SessionUsecase) LinkParticipant(ctx context.Context, sessionID, participantID, groupID, tenantID string) (*repository.LinkParticipantResult, error) {
	p, err := u.sessionRepo.GetParticipantByID(ctx, participantID, tenantID)
	if err != nil {
		return nil, err
	}

	// Capture previous session info before overwrite.
	var prevSessionID, prevSessionName, prevProgramID string
	if p.SessionID != nil && *p.SessionID != "" {
		prevSessionID = *p.SessionID
		prevS, serr := u.sessionRepo.GetSessionByID(ctx, prevSessionID, "")
		if serr == nil {
			prevSessionName = prevS.Name
			prevProgramID = prevS.ProgramID
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
	// Audit-friendly migration: clone the old participant's already-scored
	// (star >= 1) assessments onto the new participant in the new session,
	// remapped to the new session's session Kegiatan (same Kegiatan leaf).
	// Best-effort and non-fatal: the link already succeeded, so a clone error
	// must not lose the result. Only runs when both repos are wired.
	_ = u.cloneScoredAssessments(ctx, participantID, prevSessionID, sessionID)
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

// GetParticipant returns a single participant, tenant-scoped.
func (u *SessionUsecase) GetParticipant(ctx context.Context, participantID, tenantID string) (*entity.Participant, error) {
	return u.sessionRepo.GetParticipantByID(ctx, participantID, tenantID)
}

// GetParticipantGlobal returns a single participant by id, tenant-scoped.
func (u *SessionUsecase) GetParticipantGlobal(ctx context.Context, participantID, tenantID string) (*entity.Participant, error) {
	return u.sessionRepo.GetParticipantGlobal(ctx, participantID, tenantID)
}

// DeleteParticipant removes a participant.
func (u *SessionUsecase) DeleteParticipant(ctx context.Context, participantID, _ string) error {
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

// cloneScoredAssessments copies the old participant's scored (star >= 1)
// assessments from the previous session onto the same participant in the new
// session (LinkParticipant moves the participant, not a different child). Each
// old session_substage is resolved to its program_substage, then mapped to the
// new session's session_substage (same Kegiatan leaf). Duplicate-key conflicts
// (the participant already has a score for that leaf) are skipped.
func (u *SessionUsecase) cloneScoredAssessments(ctx context.Context, participantID, oldSessionID, newSessionID string) error {
	if u.assessmentRepo == nil || u.sessionSubstages == nil || oldSessionID == "" {
		return nil
	}
	scored, err := u.assessmentRepo.List(ctx, repository.AssessmentFilter{
		ParticipantID: participantID,
		SessionID:     oldSessionID,
	}, 1, 1000)
	if err != nil {
		return err
	}
	for i := range scored.Items {
		a := scored.Items[i]
		if a.StarRating < 1 {
			continue
		}
		oldSub, gerr := u.sessionSubstages.GetSessionSubstage(ctx, a.SessionSubstageID)
		if gerr != nil {
			continue
		}
		newSub, nerr := u.sessionSubstages.GetSessionSubstageByKeys(ctx, newSessionID, oldSub.ProgramSubstageID)
		if nerr != nil {
			continue
		}
		clone := &entity.Assessment{
			ParticipantID:     participantID,
			SessionID:         newSessionID,
			SessionSubstageID: newSub.ID,
			StarRating:        a.StarRating,
			Comment:           a.Comment,
			AssessedBy:        a.AssessedBy,
			AssessedAt:        a.AssessedAt,
			SyncStatus:        entity.SyncSynced,
		}
		if cerr := u.assessmentRepo.Create(ctx, clone); cerr != nil && !isConflict(cerr) {
			return cerr
		}
	}
	return nil
}

// firstUngradedGroup reports whether the session has an ungraded participant.
// It returns the name of the first group containing an ungraded participant
// (empty when every participant across every group is fully graded). A
// participant is "fully graded" when a scored assessment (star_rating >= 1)
// exists for every session Kegiatan leaf of the session.
func (u *SessionUsecase) firstUngradedGroup(ctx context.Context, sessionID string) (string, error) {
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
	for i := range groups {
		participants, perr := u.sessionRepo.ListParticipants(ctx, sessionID, groups[i].ID, "")
		if perr != nil {
			return "", perr
		}
		for j := range participants {
			if !u.participantFullyGraded(ctx, participants[j].ID, subIDs) {
				return groups[i].Name, nil
			}
		}
	}
	return "", nil
}

// participantFullyGraded reports whether the participant has a scored assessment
// for every one of the given session Kegiatan leaves.
func (u *SessionUsecase) participantFullyGraded(ctx context.Context, participantID string, sessionSubstageIDs []string) bool {
	if len(sessionSubstageIDs) == 0 {
		// No Kegiatan leaves => nothing to grade. Treat as fully graded.
		return true
	}
	for k := range sessionSubstageIDs {
		scored, lerr := u.assessmentRepo.List(ctx, repository.AssessmentFilter{
			ParticipantID:     participantID,
			SessionSubstageID: sessionSubstageIDs[k],
			TenantID:          "00000000-0000-0000-0000-000000000000",
		}, 1, 10)
		if lerr != nil || len(scored.Items) == 0 {
			return false
		}
		ok := false
		for m := range scored.Items {
			if scored.Items[m].StarRating >= 1 {
				ok = true
				break
			}
		}
		if !ok {
			return false
		}
	}
	return true
}

func isValidSessionStatus(s string) bool {
	switch entity.SessionStatus(s) {
	case entity.SessionDraft, entity.SessionActive, entity.SessionCompleted, entity.SessionCancelled:
		return true
	}
	return false
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

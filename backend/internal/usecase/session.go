package usecase

import (
	"context"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// SessionUsecase orchestrates session + stages + groups + participants business logic.
type SessionUsecase struct {
	repo repository.SessionRepository
}

// NewSessionUsecase builds the session usecase.
func NewSessionUsecase(repo repository.SessionRepository) *SessionUsecase {
	return &SessionUsecase{repo: repo}
}

// CreateSession creates a new DRAFT session owned by the tenant.
func (u *SessionUsecase) CreateSession(ctx context.Context, tenantID, createdBy string, programID, name, sessionDate, location, notes string) (*entity.Session, error) {
	tp := &tenantID
	if tenantID == "" {
		tp = nil
	}
	cb := &createdBy
	if createdBy == "" {
		cb = nil
	}
	s := &entity.Session{
		TenantID:    tp,
		ProgramID:   programID,
		Name:        name,
		SessionDate: sessionDate,
		Location:    location,
		Notes:       notes,
		Status:      entity.SessionDraft,
		CreatedBy:   cb,
	}
	if err := u.repo.CreateSession(ctx, s); err != nil {
		return nil, err
	}
	return s, nil
}

// GetSession returns the expanded session detail (stages + groups + participants).
func (u *SessionUsecase) GetSession(ctx context.Context, id string) (*repository.SessionDetail, error) {
	s, err := u.repo.GetSessionByID(ctx, id)
	if err != nil {
		return nil, err
	}
	stages, err := u.repo.ListSessionStages(ctx, id)
	if err != nil {
		return nil, err
	}
	groups, err := u.repo.ListSessionGroups(ctx, id)
	if err != nil {
		return nil, err
	}
	gwp := make([]repository.GroupWithParticipants, 0, len(groups))
	for i := range groups {
		ps, err := u.repo.ListParticipants(ctx, id, groups[i].ID)
		if err != nil {
			return nil, err
		}
		gwp = append(gwp, repository.GroupWithParticipants{SessionGroup: groups[i], Participants: ps})
	}
	return &repository.SessionDetail{Session: *s, Stages: stages, Groups: gwp}, nil
}

// ListSessions returns paginated sessions for a tenant with optional filters.
func (u *SessionUsecase) ListSessions(ctx context.Context, f repository.SessionFilter, page, limit int) (*repository.Paginated[entity.Session], error) {
	return u.repo.ListSessions(ctx, f, page, limit)
}

// UpdateSession patches mutable session fields (and status when provided).
func (u *SessionUsecase) UpdateSession(ctx context.Context, id, programID, name, sessionDate, location, notes, status string) (*entity.Session, error) {
	s, err := u.repo.GetSessionByID(ctx, id)
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
	if err := u.repo.UpdateSession(ctx, s); err != nil {
		return nil, err
	}
	return s, nil
}

// StartSession transitions a session DRAFT -> ACTIVE (cascades stages to ACTIVE).
func (u *SessionUsecase) StartSession(ctx context.Context, id string) (*entity.Session, error) {
	s, err := u.repo.GetSessionByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if s.Status != entity.SessionDraft && s.Status != entity.SessionCancelled {
		return nil, apperrors.Conflict("bad_request", nil)
	}
	s.Status = entity.SessionActive
	if err := u.repo.UpdateSession(ctx, s); err != nil {
		return nil, err
	}
	// Cascade: stages WAITING -> ACTIVE.
	stages, err := u.repo.ListSessionStages(ctx, id)
	if err != nil {
		return nil, err
	}
	for i := range stages {
		if stages[i].Status == entity.SessionStageWaiting {
			stages[i].Status = entity.SessionStageActive
			now := nowStr()
			stages[i].StartedAt = &now
			if err := u.repo.UpdateSessionStage(ctx, &stages[i]); err != nil {
				return nil, err
			}
		}
	}
	return s, nil
}

// CompleteSession transitions ACTIVE -> COMPLETED (cascades stages/groups to COMPLETED).
func (u *SessionUsecase) CompleteSession(ctx context.Context, id string) (*entity.Session, error) {
	s, err := u.repo.GetSessionByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if s.Status != entity.SessionActive {
		return nil, apperrors.Conflict("bad_request", nil)
	}
	s.Status = entity.SessionCompleted
	if err := u.repo.UpdateSession(ctx, s); err != nil {
		return nil, err
	}
	stages, err := u.repo.ListSessionStages(ctx, id)
	if err != nil {
		return nil, err
	}
	for i := range stages {
		stages[i].Status = entity.SessionStageCompleted
		now := nowStr()
		stages[i].CompletedAt = &now
		if err := u.repo.UpdateSessionStage(ctx, &stages[i]); err != nil {
			return nil, err
		}
	}
	groups, err := u.repo.ListSessionGroups(ctx, id)
	if err != nil {
		return nil, err
	}
	for i := range groups {
		groups[i].Status = entity.GroupCompleted
		if err := u.repo.UpdateSessionGroup(ctx, &groups[i]); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// CancelSession transitions a session to CANCELLED and cancels its stages.
func (u *SessionUsecase) CancelSession(ctx context.Context, id string) (*entity.Session, error) {
	s, err := u.repo.GetSessionByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if s.Status == entity.SessionCompleted {
		return nil, apperrors.Conflict("bad_request", nil)
	}
	s.Status = entity.SessionCancelled
	if err := u.repo.UpdateSession(ctx, s); err != nil {
		return nil, err
	}
	stages, err := u.repo.ListSessionStages(ctx, id)
	if err != nil {
		return nil, err
	}
	for i := range stages {
		if stages[i].Status == entity.SessionStageActive {
			stages[i].Status = entity.SessionStageCompleted
			now := nowStr()
			stages[i].CompletedAt = &now
			if err := u.repo.UpdateSessionStage(ctx, &stages[i]); err != nil {
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
func (u *SessionUsecase) DeleteSession(ctx context.Context, id string) error {
	s, err := u.repo.GetSessionByID(ctx, id)
	if err != nil {
		return err
	}
	if s.Status == entity.SessionActive || s.Status == entity.SessionCompleted {
		return apperrors.Conflict("session_not_deletable", nil)
	}
	return u.repo.DeleteSession(ctx, id)
}

// AssignFacilitator assigns a facilitator to a session stage.
func (u *SessionUsecase) AssignFacilitator(ctx context.Context, sessionID, stageID, facilitatorID string) (*entity.SessionStage, error) {
	stages, err := u.repo.ListSessionStages(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	for i := range stages {
		if stages[i].ID == stageID {
			fid := facilitatorID
			stages[i].FacilitatorID = &fid
			if err := u.repo.UpdateSessionStage(ctx, &stages[i]); err != nil {
				return nil, err
			}
			return &stages[i], nil
		}
	}
	return nil, apperrors.NotFound("not_found", nil)
}

// GetStages lists the session stages.
func (u *SessionUsecase) GetStages(ctx context.Context, sessionID string) ([]entity.SessionStage, error) {
	return u.repo.ListSessionStages(ctx, sessionID)
}

// CreateGroup creates a new session group.
func (u *SessionUsecase) CreateGroup(ctx context.Context, sessionID, name string) (*entity.SessionGroup, error) {
	g := &entity.SessionGroup{
		SessionID: sessionID,
		Name:      name,
		Status:    entity.GroupWaiting,
	}
	if err := u.repo.CreateSessionGroup(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

// UpdateGroup patches a session group's name/status.
func (u *SessionUsecase) UpdateGroup(ctx context.Context, groupID, name, status string) (*entity.SessionGroup, error) {
	g, err := u.repo.GetSessionGroupByID(ctx, groupID)
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
	if err := u.repo.UpdateSessionGroup(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

// DeleteGroup removes a session group.
func (u *SessionUsecase) DeleteGroup(ctx context.Context, groupID string) error {
	return u.repo.DeleteSessionGroup(ctx, groupID)
}

// GetGroups lists the session groups.
func (u *SessionUsecase) GetGroups(ctx context.Context, sessionID string) ([]entity.SessionGroup, error) {
	return u.repo.ListSessionGroups(ctx, sessionID)
}

// CreateParticipant adds a participant to a session (and optional group).
func (u *SessionUsecase) CreateParticipant(ctx context.Context, tenantID, sessionID, groupID, childName string, childAge int, schoolName, parentName, parentPhone, parentEmail string, consentRecording, consentPhoto bool) (*entity.Participant, error) {
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
		TenantID:         tp,
		SessionID:        sid,
		GroupID:          gid,
		ChildName:        childName,
		ChildAge:         childAge,
		SchoolName:       schoolName,
		ParentName:       parentName,
		ParentPhone:      parentPhone,
		ParentEmail:      parentEmail,
		ConsentRecording: consentRecording,
		ConsentPhoto:     consentPhoto,
	}
	if err := u.repo.CreateParticipant(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// ImportParticipants bulk-creates participants inside a single transaction.
func (u *SessionUsecase) ImportParticipants(ctx context.Context, tenantID, sessionID string, rows []repository.ParticipantInput) ([]entity.Participant, error) {
	out := make([]entity.Participant, 0, len(rows))
	err := u.repo.Transaction(ctx, func(tx repository.SessionRepository) error {
		tp := &tenantID
		if tenantID == "" {
			tp = nil
		}
		sid := &sessionID
		if sessionID == "" {
			sid = nil
		}
		for _, r := range rows {
			gid := r.GroupID // already *string (nil = no group)
			p := &entity.Participant{
				TenantID:         tp,
				SessionID:        sid,
				GroupID:          gid,
				ChildName:        r.ChildName,
				ChildAge:         r.ChildAge,
				SchoolName:       r.SchoolName,
				ParentName:       r.ParentName,
				ParentPhone:      r.ParentPhone,
				ParentEmail:      r.ParentEmail,
				ConsentRecording: r.ConsentRecording,
				ConsentPhoto:     r.ConsentPhoto,
			}
			if err := tx.CreateParticipant(ctx, p); err != nil {
				return err
			}
			out = append(out, *p)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// LinkParticipant attaches an existing participant to a session (and optional group).
func (u *SessionUsecase) LinkParticipant(ctx context.Context, sessionID, participantID, groupID string) (*entity.Participant, error) {
	p, err := u.repo.GetParticipantByID(ctx, participantID)
	if err != nil {
		return nil, err
	}
	sid := sessionID
	p.SessionID = &sid
	if groupID != "" {
		g := groupID
		p.GroupID = &g
	}
	if err := u.repo.UpdateParticipant(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// UpdateParticipant patches a participant's fields.
func (u *SessionUsecase) UpdateParticipant(ctx context.Context, participantID, childName string, childAge int, schoolName, parentName, parentPhone, parentEmail, groupID string, consentRecording, consentPhoto bool, hasAge bool) (*entity.Participant, error) {
	p, err := u.repo.GetParticipantByID(ctx, participantID)
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
	if consentRecording {
		p.ConsentRecording = true
	}
	if consentPhoto {
		p.ConsentPhoto = true
	}
	if err := u.repo.UpdateParticipant(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// GetParticipants lists participants for a session (optionally filtered by group).
func (u *SessionUsecase) GetParticipants(ctx context.Context, sessionID, groupID string) ([]entity.Participant, error) {
	return u.repo.ListParticipants(ctx, sessionID, groupID)
}

// ListParticipantsGlobal lists participants across the caller's tenant scope with
// optional session_id/group_id filters plus pagination and search. tenantID is the
// resolved tenant from context ("" for tenant-less SUPER_ADMIN scoped calls is allowed
// only when sessionID/groupID narrow the query).
func (u *SessionUsecase) ListParticipantsGlobal(ctx context.Context, tenantID, sessionID, groupID, search string, page, limit int) (*repository.Paginated[entity.Participant], error) {
	return u.repo.ListParticipantsPaginated(ctx, tenantID, sessionID, groupID, search, page, limit)
}

// GetParticipant returns a single participant.
func (u *SessionUsecase) GetParticipant(ctx context.Context, participantID string) (*entity.Participant, error) {
	return u.repo.GetParticipantByID(ctx, participantID)
}

// DeleteParticipant removes a participant.
func (u *SessionUsecase) DeleteParticipant(ctx context.Context, participantID string) error {
	return u.repo.DeleteParticipant(ctx, participantID)
}

func nowStr() string {
	return time.Now().Format("2006-01-02 15:04:05")
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

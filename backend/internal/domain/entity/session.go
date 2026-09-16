package entity

import "time"

// Session is a single running instance of a program for a group of participants.
type Session struct {
	BaseModel
	TenantID    *string       `json:"tenant_id,omitempty"`
	ProgramID   string        `json:"program_id"`
	ProgramName string        `json:"program_name,omitempty"` // denormalized from programs.name
	Name        string        `json:"name"`
	SessionDate string        `json:"session_date"`
	StartTime   *string       `json:"start_time,omitempty"`
	EndTime     *string       `json:"end_time,omitempty"`
	Location    string        `json:"location"`
	Status      SessionStatus `json:"status"`
	Notes       string        `json:"notes,omitempty"`
	CreatedBy   *string       `json:"created_by,omitempty"`
}

// SessionStage is an instantiation of a Topik within a session.
type SessionStage struct {
	BaseModel
	SessionID        string             `json:"session_id"`
	ProgramStageID   string             `json:"program_stage_id"`
	ProgramStageName string             `json:"program_stage_name,omitempty"` // denormalized from program_stages.name
	FacilitatorID    *string            `json:"facilitator_id,omitempty"`
	Status           SessionStageStatus `json:"status"`
	StartedAt        *time.Time         `json:"started_at,omitempty"`
	CompletedAt      *time.Time         `json:"completed_at,omitempty"`
}

// SessionGroup is a cohort of participants within a session.
type SessionGroup struct {
	BaseModel
	SessionID             string      `json:"session_id"`
	Name                  string      `json:"name"`
	Status                GroupStatus `json:"status"`
	CurrentSessionStageID *string     `json:"current_session_stage_id,omitempty"`
	FacilitatorID         *string     `json:"facilitator_id,omitempty"`
}

// GroupStageProgress is the live progress of one group through one Kegiatan.
type GroupStageProgress struct {
	BaseModel
	GroupID           string                   `json:"group_id"`
	SessionSubstageID string                   `json:"session_substage_id" gorm:"column:session_substage_id"`
	Status            GroupStageProgressStatus `json:"status"`
	EnteredAt         *time.Time               `json:"entered_at,omitempty"`
	CompletedAt       *time.Time               `json:"completed_at,omitempty"`
	UnlockedBy        *string                  `json:"unlocked_by,omitempty"`
	UnlockReason      string                   `json:"unlock_reason,omitempty"`
	LockedBy          *string                  `json:"locked_by,omitempty"`
	LockedAt          *time.Time               `json:"locked_at,omitempty"`
}

// GroupStageProgressHistory is the append-only audit trail of lock/unlock
// transitions on a group's session Kegiatan progress.
type GroupStageProgressHistory struct {
	BaseModel
	GroupID           string  `json:"group_id"`
	SessionID         string  `json:"session_id"`
	SessionSubstageID string  `json:"session_substage_id"`
	FromStatus        string  `json:"from_status,omitempty"`
	ToStatus          string  `json:"to_status"`
	ActorID           *string `json:"actor_id,omitempty"`
	Reason            string  `json:"reason,omitempty"`
}

// Participant is a child (and their parent/guardian) in a session group.
type Participant struct {
	BaseModel
	TenantID     *string    `json:"tenant_id,omitempty"`
	SessionID    *string    `json:"session_id,omitempty"`
	GroupID      *string    `json:"group_id,omitempty"`
	ChildName    string     `json:"child_name"`
	ChildAge     int        `json:"child_age"`
	SchoolName   string     `json:"school_name,omitempty"`
	ParentName   string     `json:"parent_name"`
	ParentPhone  string     `json:"parent_phone"`
	ParentEmail  string     `json:"parent_email,omitempty"`
	SessionName  string     `json:"session_name,omitempty"` // denormalized from sessions.name
	ConsentPhoto bool       `json:"consent_photo"`
	ConsentAt    *time.Time `json:"consent_at,omitempty"`
	// ConsentCombinedToken is a single-use token (per participant) used by the
	// WhatsApp consent-delivery flow. The parent submits photo consent
	// in one form via this token. Empty when no active request is pending.
	ConsentCombinedToken *string `json:"consent_combined_token,omitempty"`
	// ConsentCombinedTokenExpiresAt is the RFC3339 expiry of the combined token.
	ConsentCombinedTokenExpiresAt *time.Time `json:"consent_combined_token_expires_at,omitempty"`
}

// SessionIDValue returns the session_id as a string (empty if nil).
func (p *Participant) SessionIDValue() string {
	if p.SessionID != nil {
		return *p.SessionID
	}
	return ""
}

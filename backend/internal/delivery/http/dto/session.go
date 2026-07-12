package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// CreateSessionRequest is the payload for POST /api/sessions.
type CreateSessionRequest struct {
	ProgramID   string `json:"program_id" validate:"required"`
	Name        string `json:"name" validate:"required"`
	SessionDate string `json:"session_date" validate:"required"`
	Location    string `json:"location" validate:"required"`
	Notes       string `json:"notes,omitempty"`
}

// UpdateSessionRequest is the payload for PUT /api/sessions/:id.
type UpdateSessionRequest struct {
	ProgramID   string `json:"program_id,omitempty"`
	Name        string `json:"name,omitempty"`
	SessionDate string `json:"session_date,omitempty"`
	Location    string `json:"location,omitempty"`
	Notes       string `json:"notes,omitempty"`
	Status      string `json:"status,omitempty"`
}

// AssignFacilitatorRequest is the payload for POST /api/sessions/:id/stages/:stageId/assign.
type AssignFacilitatorRequest struct {
	FacilitatorID string `json:"facilitator_id" validate:"required"`
}

// CreateGroupRequest is the payload for POST /api/sessions/:id/groups.
type CreateGroupRequest struct {
	Name string `json:"name" validate:"required"`
}

// UpdateGroupRequest is the payload for PUT /api/sessions/:id/groups/:groupId.
type UpdateGroupRequest struct {
	Name   string `json:"name,omitempty"`
	Status string `json:"status,omitempty"`
}

// CreateParticipantRequest is the payload for POST /api/sessions/:id/participants.
type CreateParticipantRequest struct {
	ChildName        string `json:"child_name" validate:"required"`
	ChildAge         int    `json:"child_age" validate:"gte=0"`
	SchoolName       string `json:"school_name,omitempty"`
	ParentName       string `json:"parent_name" validate:"required"`
	ParentPhone      string `json:"parent_phone" validate:"required"`
	ParentEmail      string `json:"parent_email,omitempty"`
	GroupID          string `json:"group_id,omitempty"`
	ConsentRecording bool   `json:"consent_recording"`
	ConsentPhoto     bool   `json:"consent_photo"`
}

// UpdateParticipantRequest is the payload for PUT /api/sessions/:id/participants/:participantId.
type UpdateParticipantRequest struct {
	ChildName        string `json:"child_name,omitempty"`
	ChildAge         int    `json:"child_age,omitempty"`
	SchoolName       string `json:"school_name,omitempty"`
	ParentName       string `json:"parent_name,omitempty"`
	ParentPhone      string `json:"parent_phone,omitempty"`
	ParentEmail      string `json:"parent_email,omitempty"`
	GroupID          string `json:"group_id,omitempty"`
	ConsentRecording bool   `json:"consent_recording"`
	ConsentPhoto     bool   `json:"consent_photo"`
}

// ImportParticipantsRequest is the payload for POST /api/sessions/:id/participants/import.
type ImportParticipantsRequest struct {
	Rows []CreateParticipantRequest `json:"rows" validate:"required,min=1,dive"`
}

// LinkParticipantRequest is the payload for POST /api/sessions/:id/participants/link.
type LinkParticipantRequest struct {
	ParticipantID string `json:"participant_id" validate:"required"`
	GroupID       string `json:"group_id,omitempty"`
}

// GroupWithParticipants groups a session group with its participants (GET detail).
type GroupWithParticipants struct {
	entity.SessionGroup
	Participants []entity.Participant `json:"participants"`
}

// SessionDetail is the expanded session view returned by GET /api/sessions/:id.
type SessionDetail struct {
	Session entity.Session          `json:"session"`
	Stages  []entity.SessionStage   `json:"stages"`
	Groups  []GroupWithParticipants `json:"groups"`
}

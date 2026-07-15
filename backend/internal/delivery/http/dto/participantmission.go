package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// ParticipantMissionResponse is the read representation of a participant mission.
type ParticipantMissionResponse struct {
	*entity.ParticipantMission
}

// NewParticipantMissionResponse wraps a participant-mission entity.
func NewParticipantMissionResponse(m *entity.ParticipantMission) *ParticipantMissionResponse {
	return &ParticipantMissionResponse{ParticipantMission: m}
}

// ParticipantMissionRequest is the create/update payload.
// ParticipantID is intentionally omitted: it is derivable from
// report_id -> reports.participant_id (3NF).
type ParticipantMissionRequest struct {
	ReportID      string `json:"report_id" validate:"required"`
	MissionBankID string `json:"mission_bank_id" validate:"required"`
	IsCompleted   bool   `json:"is_completed"`
}

// ParticipantMissionListResponse carries a list of participant missions.
type ParticipantMissionListResponse struct {
	Items []ParticipantMissionResponse `json:"items"`
}

// NewParticipantMissionListResponse wraps a slice of participant missions.
func NewParticipantMissionListResponse(items []entity.ParticipantMission) *ParticipantMissionListResponse {
	out := make([]ParticipantMissionResponse, 0, len(items))
	for i := range items {
		out = append(out, ParticipantMissionResponse{ParticipantMission: &items[i]})
	}
	return &ParticipantMissionListResponse{Items: out}
}

// ParticipantMissionBulkRequest is the payload for POST /api/participant-missions/replace.
// It atomically replaces all missions for a report with the given items.
type ParticipantMissionBulkRequest struct {
	ReportID string                      `json:"report_id" validate:"required"`
	Items    []ParticipantMissionRequest `json:"items"`
}

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

package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// MissionBankResponse is the read representation of a mission-bank template.
type MissionBankResponse struct {
	*entity.MissionBank
}

// NewMissionBankResponse wraps a mission-bank entity.
func NewMissionBankResponse(m *entity.MissionBank) *MissionBankResponse {
	return &MissionBankResponse{MissionBank: m}
}

// MissionBankRequest is the create/update payload.
type MissionBankRequest struct {
	TenantID        string   `json:"tenant_id" validate:"required"`
	ProgramID       string   `json:"program_id" validate:"required"`
	Title           string   `json:"title" validate:"required"`
	RelatedStageIDs []string `json:"related_stage_ids,omitempty"`
	IsActive        bool     `json:"is_active"`
}

// MissionBankListResponse carries a page of mission templates.
type MissionBankListResponse struct {
	Items []MissionBankResponse `json:"items"`
}

// NewMissionBankListResponse wraps a slice of mission-bank entities.
func NewMissionBankListResponse(items []entity.MissionBank) *MissionBankListResponse {
	out := make([]MissionBankResponse, 0, len(items))
	for i := range items {
		out = append(out, MissionBankResponse{MissionBank: &items[i]})
	}
	return &MissionBankListResponse{Items: out}
}

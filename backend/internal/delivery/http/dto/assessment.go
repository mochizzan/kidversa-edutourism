package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// AssessmentUpsertRequest is the payload for POST /api/assessments/upsert.
// Upsert is keyed on (participant_id, session_substage_id).
type AssessmentUpsertRequest struct {
	ParticipantID     string `json:"participant_id" validate:"required"`
	SessionID         string `json:"session_id" validate:"required"`
	SessionSubstageID string `json:"session_substage_id" validate:"required"`
	StarRating        int    `json:"star_rating" validate:"min=0,max=5"`
	Comment           string `json:"comment,omitempty"`
	AssessedBy        string `json:"assessed_by" validate:"required"`
	AssessedAt        string `json:"assessed_at,omitempty"`
	SyncStatus        string `json:"sync_status,omitempty"`
}

// AssessmentBulkUpsertRequest wraps a batch of upserts.
type AssessmentBulkUpsertRequest struct {
	Items []AssessmentUpsertRequest `json:"items" validate:"required,min=1,dive"`
}

// AssessmentResponse is the list/read representation.
type AssessmentResponse struct {
	*entity.Assessment
}

// NewAssessmentResponse wraps an entity.
func NewAssessmentResponse(a *entity.Assessment) *AssessmentResponse {
	return &AssessmentResponse{Assessment: a}
}

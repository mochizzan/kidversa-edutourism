package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// ConsentResponse is the read representation of a consent log.
type ConsentResponse struct {
	*entity.ConsentLog
}

// NewConsentResponse wraps a consent-log entity.
func NewConsentResponse(c *entity.ConsentLog) *ConsentResponse {
	return &ConsentResponse{ConsentLog: c}
}

// ConsentRequest is the parent response payload.
type ConsentRequest struct {
	ParticipantID string `json:"participant_id" validate:"required"`
	SessionID     string `json:"session_id" validate:"required"`
	ConsentType   string `json:"consent_type" validate:"required"`
	Value         bool   `json:"value"`
}

// ConsentListResponse carries a list of consent logs.
type ConsentListResponse struct {
	Items []ConsentResponse `json:"items"`
}

// NewConsentListResponse wraps a slice of consent logs.
func NewConsentListResponse(items []entity.ConsentLog) *ConsentListResponse {
	out := make([]ConsentResponse, 0, len(items))
	for i := range items {
		out = append(out, ConsentResponse{ConsentLog: &items[i]})
	}
	return &ConsentListResponse{Items: out}
}

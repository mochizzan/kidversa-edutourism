package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// RecordingResponse is the read representation of a recording.
type RecordingResponse struct {
	*entity.Recording
}

// NewRecordingResponse wraps a recording entity.
func NewRecordingResponse(r *entity.Recording) *RecordingResponse {
	return &RecordingResponse{Recording: r}
}

// RecordingListResponse carries a page of recordings.
type RecordingListResponse struct {
	Items []RecordingResponse `json:"items"`
}

// NewRecordingListResponse wraps a slice of recordings.
func NewRecordingListResponse(items []entity.Recording) *RecordingListResponse {
	out := make([]RecordingResponse, 0, len(items))
	for i := range items {
		out = append(out, RecordingResponse{Recording: &items[i]})
	}
	return &RecordingListResponse{Items: out}
}

// RecordingReviewRequest carries a review decision.
type RecordingReviewRequest struct {
	ReviewStatus string  `json:"review_status" validate:"required"`
	ReviewedBy   string  `json:"reviewed_by" validate:"required"`
	Transcript   *string `json:"transcript_text,omitempty"`
}

// RecordingRequest is the update payload for PUT /api/recordings/:id.
type RecordingRequest struct {
	FileURL         string `json:"file_url,omitempty"`
	DurationSeconds int    `json:"duration_seconds"`
	TranscriptText  string `json:"transcript_text,omitempty"`
	ReviewStatus    string `json:"review_status,omitempty"`
	ReviewedBy      string `json:"reviewed_by,omitempty"`
	ReviewedAt      string `json:"reviewed_at,omitempty"`
}

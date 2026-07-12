package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// FrameResponse is the read representation of a photo frame.
type FrameResponse struct {
	*entity.PhotoFrame
}

// NewFrameResponse wraps a photo-frame entity.
func NewFrameResponse(f *entity.PhotoFrame) *FrameResponse {
	return &FrameResponse{PhotoFrame: f}
}

// FrameRequest is the create/update payload.
type FrameRequest struct {
	TenantID     string `json:"tenant_id" validate:"required"`
	ProgramID    string `json:"program_id,omitempty"`
	Name         string `json:"name" validate:"required"`
	FileURL      string `json:"file_url" validate:"required"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	IsActive     bool   `json:"is_active"`
	SortOrder    int    `json:"sort_order"`
}

// FrameListResponse carries a page of photo frames.
type FrameListResponse struct {
	Items []FrameResponse `json:"items"`
}

// NewFrameListResponse wraps a slice of photo frames.
func NewFrameListResponse(items []entity.PhotoFrame) *FrameListResponse {
	out := make([]FrameResponse, 0, len(items))
	for i := range items {
		out = append(out, FrameResponse{PhotoFrame: &items[i]})
	}
	return &FrameListResponse{Items: out}
}

package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// PhotoResponse is the read representation of a photo.
type PhotoResponse struct {
	*entity.SmartPhoto
}

// NewPhotoResponse wraps a photo entity.
func NewPhotoResponse(p *entity.SmartPhoto) *PhotoResponse {
	return &PhotoResponse{SmartPhoto: p}
}

// PhotoListResponse carries a page of photos with pagination meta.
type PhotoListResponse struct {
	Items []PhotoResponse `json:"items"`
}

// NewPhotoListResponse wraps a slice of photos.
func NewPhotoListResponse(items []entity.SmartPhoto) *PhotoListResponse {
	out := make([]PhotoResponse, 0, len(items))
	for i := range items {
		out = append(out, PhotoResponse{SmartPhoto: &items[i]})
	}
	return &PhotoListResponse{Items: out}
}

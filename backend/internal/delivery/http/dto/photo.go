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

// PhotoRequest is the update payload for PUT /api/photos/:id.
type PhotoRequest struct {
	FramedFileURL string `json:"framed_file_url,omitempty"`
	IsReportPhoto bool   `json:"is_report_photo"`
	TakenBy       string `json:"taken_by,omitempty"`
	TakenAt       string `json:"taken_at,omitempty"`
	FrameID       string `json:"frame_id,omitempty"`
}

// SetReportPhotoRequest is the body for POST /api/photos/:id/set-report-photo.
// It currently carries no fields; the photo id in the path is the target.
type SetReportPhotoRequest struct{}

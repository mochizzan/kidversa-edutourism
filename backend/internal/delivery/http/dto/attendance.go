package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// AttendanceUpsertRequest is the payload for POST /api/attendance/upsert.
type AttendanceUpsertRequest struct {
	ParticipantID string `json:"participant_id" validate:"required"`
	SessionID     string `json:"session_id" validate:"required"`
	IsPresent     bool   `json:"is_present"`
}

// AttendanceBulkUpsertRequest wraps a batch of upserts.
type AttendanceBulkUpsertRequest struct {
	Items []AttendanceUpsertRequest `json:"items" validate:"required,min=1,dive"`
}

// AttendanceResponse is the list/read representation.
type AttendanceResponse struct {
	*entity.ParticipantAttendance
}

// NewAttendanceResponse wraps an entity.
func NewAttendanceResponse(a *entity.ParticipantAttendance) *AttendanceResponse {
	return &AttendanceResponse{ParticipantAttendance: a}
}

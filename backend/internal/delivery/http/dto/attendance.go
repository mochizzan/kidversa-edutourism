package dto

import "kidversa-edutourism-backend/internal/domain/entity"

// AttendanceUpsertRequest is the payload for POST /api/attendance/upsert.
// Upsert is keyed per peserta-per-topik: (participant_id, session_id,
// session_stage_id). session_stage_id is the canonical topic identity — the
// session_stages row (see entity.ParticipantAttendance), always required on
// writes so topic B can never overwrite topic A.
type AttendanceUpsertRequest struct {
	ParticipantID  string `json:"participant_id" validate:"required"`
	SessionID      string `json:"session_id" validate:"required"`
	SessionStageID string `json:"session_stage_id" validate:"required"`
	IsPresent      bool   `json:"is_present"`
}

// AttendanceListQuery narrows GET /api/attendance. SessionID is required
// (existing contract); SessionStageID is optional — when set only that
// Topik's rows are returned, when empty all Topics are returned (compat).
type AttendanceListQuery struct {
	SessionID      string `json:"session_id" validate:"required"`
	SessionStageID string `json:"session_stage_id,omitempty"`
}

// AttendanceResponse is the list/read representation.
type AttendanceResponse struct {
	*entity.ParticipantAttendance
}

// NewAttendanceResponse wraps an entity.
func NewAttendanceResponse(a *entity.ParticipantAttendance) *AttendanceResponse {
	return &AttendanceResponse{ParticipantAttendance: a}
}

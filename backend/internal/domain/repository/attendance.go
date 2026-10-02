package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// AttendanceRepository is the persistence contract for participant attendance.
//
// Attendance is keyed per peserta-per-topik: (participant_id, session_id,
// session_stage_id). session_stage_id is the canonical topic identity — the
// session_stages row (see entity.ParticipantAttendance), never the
// program_stages template and never a session_substage leaf.
type AttendanceRepository interface {
	// GetByParticipantSessionStage returns the single row for
	// (participant_id, session_id, session_stage_id) or NotFound.
	GetByParticipantSessionStage(ctx context.Context, participantID, sessionID, sessionStageID, tenantID string) (*entity.ParticipantAttendance, error)
	// ListBySession returns every attendance row of a session across all
	// Topics (compat path for session-wide readers).
	ListBySession(ctx context.Context, sessionID, tenantID string) ([]entity.ParticipantAttendance, error)
	// ListBySessionStage returns the attendance rows of one Topik only.
	ListBySessionStage(ctx context.Context, sessionID, sessionStageID, tenantID string) ([]entity.ParticipantAttendance, error)
	// ListByParticipantSession returns every attendance row of one participant
	// in one session across all Topics (migration carry path).
	ListByParticipantSession(ctx context.Context, participantID, sessionID, tenantID string) ([]entity.ParticipantAttendance, error)
	// Upsert inserts or updates the single row for
	// (participant_id, session_id, session_stage_id). A write to one Topik
	// never touches another Topik's row.
	Upsert(ctx context.Context, a *entity.ParticipantAttendance) error
}

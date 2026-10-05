package entity

import "time"

// ParticipantAttendance tracks whether a participant was present for one Topik
// (session_stages row) of a session. Keyed per peserta-per-topik:
// (participant_id, session_id, session_stage_id).
//
// SessionStageID is the canonical topic identity: the session_stages row
// (entity/session.go SessionStage), NOT the program_stages template and NOT
// a session_substage leaf. Mapping to assessments: an assessment's
// session_substage_id resolves its Topik via
// session_substages.session_stage_id, which equals this column.
// Legacy rows predate the per-topic migration and carry an empty SessionStageID
// (session-wide, pre-backfill); all new writes require a Topik.
type ParticipantAttendance struct {
	BaseModel
	ParticipantID  string    `json:"participant_id"`
	SessionID      string    `json:"session_id"`
	SessionStageID string    `json:"session_stage_id,omitempty"`
	IsPresent      bool      `json:"is_present"`
	MarkedAt       time.Time `json:"marked_at"`
	MarkedBy       *string   `json:"marked_by,omitempty"`
	// SourceSessionID is provenance (penelusuran asal) for rows CARRIED by
	// LinkParticipant: the source session the row was copied from; nil for
	// rows natively created in this session. Always serialized (no omitempty)
	// so the API answers an explicit null for non-clones.
	SourceSessionID *string `json:"source_session_id"`
}

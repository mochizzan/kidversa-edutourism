package handler

import (
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// Registry holds all constructed HTTP handlers, wired in cmd/server after
// dependencies are resolved.
type Registry struct {
	Auth                   *AuthHandler
	User                   *UserHandler
	Tenant                 *TenantHandler
	Program                *ProgramHandler
	Session                *SessionHandler
	SessionLifecycle       *SessionLifecycleHandler
	SessionStage           *SessionStageHandler
	SessionGroup           *SessionGroupHandler
	SessionParticipant     *SessionParticipantHandler
	SessionParticipantBulk *SessionParticipantBulkHandler
	Live                   *LiveHandler
	Notification           *NotificationHandler
	Assessment             *AssessmentHandler
	Photo                  *PhotoHandler
	Recording              *RecordingHandler
	Report                 *ReportHandler
	MissionBank            *MissionBankHandler
	ParticipantMission     *ParticipantMissionHandler
	Consent                *ConsentHandler
	Frame                  *FrameHandler
	Upload                 *UploadHandler
	Media                  *MediaHandler
}

// NewRegistry builds a registry with the mandatory auth handler.
func NewRegistry(auth *AuthHandler) *Registry {
	return &Registry{Auth: auth}
}

// ensure auth import referenced (token revoker type used by handlers).
var _ = auth.NewInMemoryRevoker

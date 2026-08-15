package handler

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
	Kiosk                  *KioskHandler
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
	Content                *ContentHandler
}

// NewRegistry builds a registry with the mandatory auth handler.
func NewRegistry(auth *AuthHandler) *Registry {
	return &Registry{Auth: auth}
}

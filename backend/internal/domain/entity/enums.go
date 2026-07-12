package entity

// UserRole enumerates the four platform roles.
type UserRole string

const (
	RoleSuperAdmin UserRole = "SUPER_ADMIN"
	RoleAdmin      UserRole = "ADMIN"
	RoleKoordinator UserRole = "KOORDINATOR"
	RoleFasilitator UserRole = "FASILITATOR"
)

func (r UserRole) Valid() bool {
	switch r {
	case RoleSuperAdmin, RoleAdmin, RoleKoordinator, RoleFasilitator:
		return true
	}
	return false
}

// ContentType enumerates program content types.
type ContentType string

const (
	ContentTypeVideo     ContentType = "VIDEO"
	ContentTypeSlideshow ContentType = "SLIDESHOW"
	ContentTypeGame      ContentType = "GAME"
	ContentTypeMixed     ContentType = "MIXED"
)

// StageContentFileType enumerates stage content file kinds.
type StageContentFileType string

const (
	StageContentVideo  StageContentFileType = "VIDEO"
	StageContentImage  StageContentFileType = "IMAGE"
	StageContentAudio  StageContentFileType = "AUDIO"
	StageContentBundle StageContentFileType = "GAME_BUNDLE"
)

// MissionCategory enumerates participant mission categories.
type MissionCategory string

const (
	MissionHome   MissionCategory = "HOME"
	MissionParent MissionCategory = "PARENT"
	MissionSchool MissionCategory = "SCHOOL"
)

// SessionStatus enumerates session lifecycle states.
type SessionStatus string

const (
	SessionDraft     SessionStatus = "DRAFT"
	SessionActive    SessionStatus = "ACTIVE"
	SessionCompleted SessionStatus = "COMPLETED"
	SessionCancelled SessionStatus = "CANCELLED"
)

// SessionStageStatus enumerates per-session stage states.
type SessionStageStatus string

const (
	SessionStageWaiting  SessionStageStatus = "WAITING"
	SessionStageActive   SessionStageStatus = "ACTIVE"
	SessionStageCompleted SessionStageStatus = "COMPLETED"
)

// GroupStatus enumerates session-group states.
type GroupStatus string

const (
	GroupWaiting    GroupStatus = "WAITING"
	GroupInProgress GroupStatus = "IN_PROGRESS"
	GroupCompleted  GroupStatus = "COMPLETED"
)

// GroupStageProgressStatus enumerates live progress states.
type GroupStageProgressStatus string

const (
	ProgressLocked    GroupStageProgressStatus = "LOCKED"
	ProgressUnlocked  GroupStageProgressStatus = "UNLOCKED"
	ProgressInProgress GroupStageProgressStatus = "IN_PROGRESS"
	ProgressCompleted GroupStageProgressStatus = "COMPLETED"
	ProgressSkipped   GroupStageProgressStatus = "SKIPPED"
)

// SyncStatus enumerates sync queue states.
type SyncStatus string

const (
	SyncLocal     SyncStatus = "LOCAL"
	SyncUploading SyncStatus = "UPLOADING"
	SyncSynced    SyncStatus = "SYNCED"
	SyncFailed    SyncStatus = "FAILED"
)

// RecordingsReviewStatus enumerates review states for recordings.
type RecordingsReviewStatus string

const (
	RecordingPending  RecordingsReviewStatus = "PENDING"
	RecordingReviewed RecordingsReviewStatus = "REVIEWED"
	RecordingSkipped  RecordingsReviewStatus = "SKIPPED"
)

// ConsentType enumerates consent kinds.
type ConsentType string

const (
	ConsentRecording ConsentType = "RECORDING"
	ConsentPhoto     ConsentType = "PHOTO"
)

// ReportStatus enumerates report lifecycle states.
type ReportStatus string

const (
	ReportDraft         ReportStatus = "DRAFT"
	ReportPendingReview ReportStatus = "PENDING_REVIEW"
	ReportApproved      ReportStatus = "APPROVED"
	ReportSent          ReportStatus = "SENT"
)

// ApprovalStatus enumerates user approval states (lowercase to match DB enum).
type ApprovalStatus string

const (
	ApprovalPending  ApprovalStatus = "pending"
	ApprovalApproved ApprovalStatus = "approved"
	ApprovalRejected ApprovalStatus = "rejected"
)

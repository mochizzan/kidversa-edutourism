package persistence

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

type GormConsentRepository struct {
	db              *gorm.DB
	consentTokenTTL time.Duration
}

// NewConsentRepository builds a GORM-backed consent repository. consentTokenTTL
// is the lifetime of a single-use consent token (from config).
func NewConsentRepository(db *gorm.DB, consentTokenTTL time.Duration) repository.ConsentRepository {
	return &GormConsentRepository{db: db, consentTokenTTL: consentTokenTTL}
}

// CreateConsent persists a new consent log row (initial send).
func (r *GormConsentRepository) CreateConsent(ctx context.Context, log *entity.ConsentLog) error {
	m := ConsentLogModel{ConsentLog: *log}
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*log = m.ConsentLog
	return nil
}

// GetConsentValue returns the latest consent value for the participant/session/type.
// A participant may have multiple consent log rows (re-consents); the most
// recent responded value wins. Returns false when no record exists.
func (r *GormConsentRepository) GetConsentValue(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) (bool, error) {
	var m ConsentLogModel
	err := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_id = ? AND consent_type = ?", participantID, sessionID, string(consentType)).
		Order("created_at DESC, id DESC").
		First(&m).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, apperrors.Internal("internal_error", err)
	}
	return m.Value, nil
}

// RespondConsent records a parent's consent decision. It upserts the latest value for
// the (participant, session, type) tuple: updates existing row or creates new.
func (r *GormConsentRepository) RespondConsent(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType, value bool, ip, ua string) error {
	now := time.Now().UTC()
	log := &entity.ConsentLog{
		ParticipantID: participantID,
		SessionID:     sessionID,
		ConsentType:   consentType,
		Value:         value,
		SentAt:        now,
		RespondedAt:   &now,
		IPAddress:     ip,
		UserAgent:     ua,
	}
	// Upsert: try to find existing row first.
	existing := ConsentLogModel{}
	err := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_id = ? AND consent_type = ?", participantID, sessionID, string(consentType)).
		First(&existing).Error
	if err == nil {
		// Row exists — update with new consent decision.
		return r.db.WithContext(ctx).
			Model(&existing).
			Updates(map[string]interface{}{
				"value":        value,
				"sent_at":      now,
				"responded_at": &now,
				"ip_address":   ip,
				"user_agent":   ua,
			}).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return apperrors.Internal("internal_error", err)
	}
	// No existing row — create new.
	m := ConsentLogModel{ConsentLog: *log}
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*log = m.ConsentLog
	return nil
}

// ListConsentsByParticipant returns all consent rows for a participant.
func (r *GormConsentRepository) ListConsentsByParticipant(ctx context.Context, participantID string) ([]entity.ConsentLog, error) {
	var models []ConsentLogModel
	if err := r.db.WithContext(ctx).
		Where("participant_id = ?", participantID).
		Order("created_at DESC").
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.ConsentLog, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}

// ListConsentsBySession returns all consent rows for a session.
func (r *GormConsentRepository) ListConsentsBySession(ctx context.Context, sessionID string) ([]entity.ConsentLog, error) {
	var models []ConsentLogModel
	if err := r.db.WithContext(ctx).
		Where("session_id = ?", sessionID).
		Order("created_at DESC").
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.ConsentLog, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}

// ListConsentsBySessionIDs returns all consent rows for multiple sessions in one query.
func (r *GormConsentRepository) ListConsentsBySessionIDs(ctx context.Context, sessionIDs []string) (map[string][]entity.ConsentLog, error) {
	if len(sessionIDs) == 0 {
		return make(map[string][]entity.ConsentLog), nil
	}
	var models []ConsentLogModel
	if err := r.db.WithContext(ctx).
		Where("session_id IN ?", sessionIDs).
		Order("created_at DESC").
		Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	grouped := make(map[string][]entity.ConsentLog)
	for i := range models {
		e := models[i].ToEntity()
		grouped[e.SessionID] = append(grouped[e.SessionID], *e)
	}
	return grouped, nil
}

// SendConsentRequest records that a consent request was sent. It upserts the
// (participant, session, type) row: if a row already exists, updates sent_at
// and clears responded_at (re-send scenario). Otherwise creates a new row.
func (r *GormConsentRepository) SendConsentRequest(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) error {
	now := time.Now().UTC()
	m := ConsentLogModel{
		ConsentLog: entity.ConsentLog{
			ParticipantID: participantID,
			SessionID:     sessionID,
			ConsentType:   consentType,
			SentAt:        now,
		},
	}
	// Upsert: if row exists for this (participant, session, type), update sent_at.
	existing := ConsentLogModel{}
	err := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_id = ? AND consent_type = ?", participantID, sessionID, string(consentType)).
		First(&existing).Error
	if err == nil {
		// Row exists — update sent_at, clear responded_at (re-send).
		return r.db.WithContext(ctx).
			Model(&existing).
			Updates(map[string]interface{}{
				"sent_at":      now,
				"responded_at": nil,
				"value":        false,
			}).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return apperrors.Internal("internal_error", err)
	}
	// No existing row — create new.
	return r.db.WithContext(ctx).Create(&m).Error
}

// GetParticipantByConsentToken resolves a participant by their active combined consent
// token (WhatsApp delivery flow). Queries the participants table directly.
func (r *GormConsentRepository) GetParticipantByConsentToken(ctx context.Context, token string) (*entity.Participant, error) {
	if token == "" {
		return nil, apperrors.NotFound("token_invalid", errors.New("token required"))
	}
	var m ParticipantModel
	if err := r.db.WithContext(ctx).
		Where("consent_combined_token = ?", token).
		First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("token_invalid", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

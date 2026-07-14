package persistence

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormPhotoRepository implements repository.PhotoRepository.
type GormPhotoRepository struct {
	db *gorm.DB
}

// NewPhotoRepository builds a GORM-backed photo repository.
func NewPhotoRepository(db *gorm.DB) repository.PhotoRepository {
	return &GormPhotoRepository{db: db}
}

func (r *GormPhotoRepository) Create(ctx context.Context, p *entity.SmartPhoto) error {
	m := smartPhotoModelFromEntity(p)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*p = *m.ToEntity()
	return nil
}

func (r *GormPhotoRepository) GetByID(ctx context.Context, id, tenantID string) (*entity.SmartPhoto, error) {
	var m SmartPhotoModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	// Tenant scoping: restrict to the photo's owning session's tenant (joined via
	// sessions) unless tenantID is empty (tenant-less SUPER_ADMIN).
	if tenantID != "" {
		q = q.Where("session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)", tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormPhotoRepository) Update(ctx context.Context, p *entity.SmartPhoto) error {
	m := smartPhotoModelFromEntity(p)
	if err := r.db.WithContext(ctx).Model(&SmartPhotoModel{}).Where("id = ?", p.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// UpdateFields applies a partial (map) update, so zero/false values persist (C2).
func (r *GormPhotoRepository) UpdateFields(ctx context.Context, id string, fields map[string]interface{}) error {
	if err := r.db.WithContext(ctx).Model(&SmartPhotoModel{}).Where("id = ?", id).Updates(fields).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// SetReportPhoto marks photoID as the exclusive is_report_photo for its
// participant+session scope, clearing the flag on all other photos in scope.
func (r *GormPhotoRepository) SetReportPhoto(ctx context.Context, participantID, sessionID, photoID string) error {
	if err := r.db.WithContext(ctx).
		Model(&SmartPhotoModel{}).
		Where("participant_id = ? AND session_id = ?", participantID, sessionID).
		Where("is_report_photo = ?", true).
		Update("is_report_photo", false).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	if err := r.db.WithContext(ctx).
		Model(&SmartPhotoModel{}).
		Where("id = ?", photoID).
		Update("is_report_photo", true).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormPhotoRepository) Delete(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&SmartPhotoModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// List returns photos matching the filter (paginated).
func (r *GormPhotoRepository) List(ctx context.Context, f repository.PhotoFilter, page, limit int) (*repository.Paginated[entity.SmartPhoto], error) {
	q := r.db.WithContext(ctx).Model(&SmartPhotoModel{})
	if f.ParticipantID != "" {
		q = q.Where("participant_id = ?", f.ParticipantID)
	}
	if f.SessionID != "" {
		q = q.Where("session_id = ?", f.SessionID)
	}
	if f.FrameID != "" {
		q = q.Where("frame_id = ?", f.FrameID)
	}
	if f.IsReportPhoto != nil {
		q = q.Where("is_report_photo = ?", *f.IsReportPhoto)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []SmartPhotoModel
	offset := (page - 1) * limit
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.SmartPhoto, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.SmartPhoto]{Items: items, Total: int(total)}, nil
}

// GormRecordingRepository implements repository.RecordingRepository.
type GormRecordingRepository struct {
	db *gorm.DB
}

// NewRecordingRepository builds a GORM-backed recording repository.
func NewRecordingRepository(db *gorm.DB) repository.RecordingRepository {
	return &GormRecordingRepository{db: db}
}

func (r *GormRecordingRepository) Create(ctx context.Context, rec *entity.Recording) error {
	m := recordingModelFromEntity(rec)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*rec = *m.ToEntity()
	return nil
}

func (r *GormRecordingRepository) GetByID(ctx context.Context, id, tenantID string) (*entity.Recording, error) {
	var m RecordingModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	// Tenant scoping: restrict to the recording's owning session's tenant (joined
	// via sessions) unless tenantID is empty (tenant-less SUPER_ADMIN).
	if tenantID != "" {
		q = q.Where("session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)", tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormRecordingRepository) Update(ctx context.Context, rec *entity.Recording) error {
	m := recordingModelFromEntity(rec)
	if err := r.db.WithContext(ctx).Model(&RecordingModel{}).Where("id = ?", rec.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// UpdateFields applies a partial (map) update, so zero/false values persist (C2).
func (r *GormRecordingRepository) UpdateFields(ctx context.Context, id string, fields map[string]interface{}) error {
	if err := r.db.WithContext(ctx).Model(&RecordingModel{}).Where("id = ?", id).Updates(fields).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormRecordingRepository) Delete(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&RecordingModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// List returns recordings matching the filter (paginated).
func (r *GormRecordingRepository) List(ctx context.Context, f repository.RecordingFilter, page, limit int) (*repository.Paginated[entity.Recording], error) {
	q := r.db.WithContext(ctx).Model(&RecordingModel{})
	if f.ParticipantID != "" {
		q = q.Where("participant_id = ?", f.ParticipantID)
	}
	if f.SessionID != "" {
		q = q.Where("session_id = ?", f.SessionID)
	}
	if f.SessionStageID != "" {
		q = q.Where("session_stage_id = ?", f.SessionStageID)
	}
	if f.ReviewStatus != "" {
		q = q.Where("review_status = ?", f.ReviewStatus)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []RecordingModel
	offset := (page - 1) * limit
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Recording, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.Recording]{Items: items, Total: int(total)}, nil
}

// GormConsentRepository implements repository.ConsentRepository.
type GormConsentRepository struct {
	db            *gorm.DB
	consentTokenTTL time.Duration
}

// NewConsentRepository builds a GORM-backed consent repository. consentTokenTTL
// is the lifetime of a single-use consent token (from config).
func NewConsentRepository(db *gorm.DB, consentTokenTTL time.Duration) repository.ConsentRepository {
	return &GormConsentRepository{db: db, consentTokenTTL: consentTokenTTL}
}

// Create persists a new consent log row (initial send).
func (r *GormConsentRepository) Create(ctx context.Context, log *entity.ConsentLog) error {
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

// GetValue returns the latest consent value for the participant/session/type.
// A participant may have multiple consent log rows (re-consents); the most
// recent responded value wins. Returns false when no record exists.
func (r *GormConsentRepository) GetValue(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) (bool, error) {
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

// Respond records a parent's consent decision. It upserts the latest value for
// the (participant, session, type) tuple and writes a new audit log row.
func (r *GormConsentRepository) Respond(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType, value bool, ip, ua string) error {
	now := time.Now().Format(time.RFC3339)
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
	if err := r.Create(ctx, log); err != nil {
		return err
	}
	return nil
}

// ListByParticipant returns all consent rows for a participant.
func (r *GormConsentRepository) ListByParticipant(ctx context.Context, participantID string) ([]entity.ConsentLog, error) {
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

// ListBySession returns all consent rows for a session.
func (r *GormConsentRepository) ListBySession(ctx context.Context, sessionID string) ([]entity.ConsentLog, error) {
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

// GetByToken resolves a consent-log row by its single-use token.
func (r *GormConsentRepository) GetByToken(ctx context.Context, token string) (*entity.ConsentLog, error) {
	var m ConsentLogModel
	if err := r.db.WithContext(ctx).
		Where("consent_token = ?", token).
		First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("token_invalid", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

// SendRequest issues a single-use consent token for a (participant, session, type)
// and persists it on a new consent-log row. The token is cryptographically random
// (>=32 bytes hex) and expires in 24h.
func (r *GormConsentRepository) SendRequest(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) (string, error) {
	token, err := generateConsentToken()
	if err != nil {
		return "", apperrors.Internal("internal_error", err)
	}
	now := time.Now()
	expiresAt := now.Add(r.consentTokenTTL).Format(time.RFC3339)
	log := &entity.ConsentLog{
		ParticipantID: participantID,
		SessionID:     sessionID,
		ConsentType:   consentType,
		Value:         false,
		SentAt:        now.Format(time.RFC3339),
		ConsentToken:  token,
		ExpiresAt:     &expiresAt,
	}
	if err := r.Create(ctx, log); err != nil {
		return "", err
	}
	return token, nil
}

// RespondByToken records a parent's consent decision via a single-use token
// (public flow). Replays / expired tokens are rejected (SC6 replay protection).
func (r *GormConsentRepository) RespondByToken(ctx context.Context, token string, value bool, ip, ua string) error {
	if token == "" {
		return apperrors.NotFound("token_invalid", errors.New("token required"))
	}
	var m ConsentLogModel
	if err := r.db.WithContext(ctx).
		Where("consent_token = ?", token).
		First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperrors.NotFound("token_invalid", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	// Replay protection: already consumed or expired.
	if m.ConsumedAt != nil {
		return apperrors.Conflict("token_consumed", errors.New("consent token already used"))
	}
	if m.ExpiresAt != nil {
		if exp, err := time.Parse(time.RFC3339, *m.ExpiresAt); err == nil && time.Now().After(exp) {
			return apperrors.Forbidden("token_expired", errors.New("consent token expired"))
		}
	}
	now := time.Now().Format(time.RFC3339)
	updates := map[string]interface{}{
		"value":        value,
		"responded_at": now,
		"consumed_at":  now,
		"ip_address":   ip,
		"user_agent":   ua,
		"updated_at":   time.Now(),
	}
	if err := r.db.WithContext(ctx).Model(&ConsentLogModel{}).
		Where("id = ?", m.ID).
		Updates(updates).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// generateConsentToken returns a cryptographically-random hex token (32 bytes → 64 hex chars).
func generateConsentToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// TenantIDForSession returns the owning tenant of the given session.
func (r *GormSessionRepository) TenantIDForSession(ctx context.Context, sessionID string) (string, error) {
	var tenantID string
	err := r.db.WithContext(ctx).
		Model(&sessionTenantView{}).
		Where("id = ?", sessionID).
		Limit(1).
		Pluck("tenant_id", &tenantID).Error
	if err != nil {
		return "", apperrors.Internal("internal_error", err)
	}
	if tenantID == "" {
		return "", apperrors.NotFound("not_found", errors.New("session not found"))
	}
	return tenantID, nil
}

// sessionTenantView is a minimal struct mapping to the sessions table for tenant lookup.
type sessionTenantView struct {
	ID       string `gorm:"column:id"`
	TenantID string `gorm:"column:tenant_id"`
}

// TableName pins the table name.
func (sessionTenantView) TableName() string { return "sessions" }

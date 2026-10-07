package persistence

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

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
func (r *GormConsentRepository) RespondConsent(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType, value bool, ip, ua, responderName string) error {
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
		ResponderName: responderName,
	}
	// Upsert: try to find existing row first.
	existing := ConsentLogModel{}
	err := r.db.WithContext(ctx).
		Where("participant_id = ? AND session_id = ? AND consent_type = ?", participantID, sessionID, string(consentType)).
		First(&existing).Error
	if err == nil {
		// Row exists — update with new consent decision.
		if uerr := r.db.WithContext(ctx).
			Model(&existing).
			Updates(map[string]interface{}{
				"value":          value,
				"sent_at":        now,
				"responded_at":   &now,
				"ip_address":     ip,
				"user_agent":     ua,
				"responder_name": responderName,
			}).Error; uerr != nil {
			return apperrors.Internal("internal_error", uerr)
		}
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return apperrors.Internal("internal_error", err)
	}
	// No existing row — create new.
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

// Transaction runs fn inside a DB transaction, passing a repository bound to
// the tx (mirror GormSessionRepository.Transaction).
func (r *GormConsentRepository) Transaction(ctx context.Context, fn func(tx *GormConsentRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&GormConsentRepository{db: tx, consentTokenTTL: r.consentTokenTTL})
	})
}

// SendConsentRequest records that a consent request was sent. It upserts the
// (participant, session, type) row: if a row already exists, updates sent_at
// and clears responded_at (re-send scenario). Otherwise creates a new row.
// AR-7 concurrency: the whole read-modify-write runs inside one transaction
// with the existing row locked (SELECT ... FOR UPDATE) — see
// sendConsentRequestLocked. A grant racing this audit write either commits
// before our lock (→ we see responded_at and preserve it) or blocks on our
// lock (→ it overwrites our unanswered row afterwards and wins either way).
// There is no interleaving in which an answered row ends up unanswered.
// Callers never touch Transaction directly — SendConsentRequest owns it.
// Pairing invariant: whenever the log row ends up UNANSWERED (responded_at
// NULL, value false) — re-send or fresh request — the denormalized
// participants.consent_photo/consent_at projection for that participant is
// cleared too, so the flag never claims granted consent while the log row is
// absent/unanswered (frontend guards read the flag; the server gate reads the
// log). AR-7 (F-A-009b) guard: an answered row (responded_at != NULL —
// granted OR denied) is NEVER regressed back to unanswered. The audit write
// is skipped entirely for such rows: sent_at/value are left intact and the
// participant projection is NOT cleared, so a grant landing mid-batch (a
// parent responds between the worker's eligibility snapshot and this write)
// is honored, not clobbered. Before touching an unanswered row the write
// additionally re-screens current eligibility (photo-consent state): a grant
// that landed after this call's initial read still wins. The unanswered-row
// path itself is unchanged (sent_at refresh + responded_at/value reset +
// projection clear). The combined token pair is deliberately NOT touched:
// callers (SendSingle) mint the fresh token BEFORE this audit write.
func (r *GormConsentRepository) SendConsentRequest(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) error {
	return r.Transaction(ctx, func(tx *GormConsentRepository) error {
		return tx.sendConsentRequestLocked(ctx, participantID, sessionID, consentType)
	})
}

// sendConsentRequestLocked is SendConsentRequest's transactional body. The
// initial read takes a FOR UPDATE lock, so the guarded UPDATE below cannot
// interleave with a concurrent RespondConsent commit: the grant either lands
// before our lock (→ responded_at visible, we preserve it) or after our
// commit (→ it overwrites our unanswered row and wins).
func (r *GormConsentRepository) sendConsentRequestLocked(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) error {
	now := time.Now().UTC()
	m := ConsentLogModel{
		ConsentLog: entity.ConsentLog{
			ParticipantID: participantID,
			SessionID:     sessionID,
			ConsentType:   consentType,
			SentAt:        now,
		},
	}
	// Upsert: if row exists for this (participant, session, type), lock it
	// (FOR UPDATE) and then decide. The locked re-read degrades gracefully:
	// on a lock-acquisition failure the query errors and we return 500
	// without writing — never a blind overwrite.
	existing := ConsentLogModel{}
	err := r.db.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("participant_id = ? AND session_id = ? AND consent_type = ?", participantID, sessionID, string(consentType)).
		First(&existing).Error
	if err == nil {
		// AR-7 guard: never regress answered→unanswered. A parent response
		// recorded any time before this audit write — including mid-batch,
		// after the worker's eligibility snapshot — wins: leave the row and
		// the participant projection untouched.
		if existing.RespondedAt != nil {
			return nil
		}
		// Re-screen (defense in depth, same tx — sees the latest committed
		// state at our snapshot/after our lock): covers log rows whose value
		// flip committed without responded_at in an unexpected path. Under
		// the FOR UPDATE lock above there is no later interleaving: a grant
		// racing us either precedes our lock (visible here) or blocks on it
		// (lands after our commit and wins).
		granted, rerr := r.GetConsentValue(ctx, participantID, sessionID, consentType)
		if rerr != nil {
			return rerr
		}
		if granted {
			return nil
		}
		// Row exists — update sent_at, clear responded_at (re-send).
		if uerr := r.db.WithContext(ctx).
			Model(&existing).
			Updates(map[string]interface{}{
				"sent_at":      now,
				"responded_at": nil,
				"value":        false,
			}).Error; uerr != nil {
			return apperrors.Internal("internal_error", uerr)
		}
		return r.clearConsentProjection(ctx, participantID, consentType)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return apperrors.Internal("internal_error", err)
	}
	// No existing row — create new.
	if cerr := r.db.WithContext(ctx).Create(&m).Error; cerr != nil {
		if isDuplicate(cerr) {
			return apperrors.Conflict("conflict", cerr)
		}
		return apperrors.Internal("internal_error", cerr)
	}
	return r.clearConsentProjection(ctx, participantID, consentType)
}

// clearConsentProjection clears the PHOTO consent projection on the participant
// row after the (participant, session, type) log row was reset/created
// unanswered — the denormalized flag must never outlive the grant it mirrors.
// consent_at marks the grant timestamp and goes with it; the combined token
// pair stays (a pending request still owns its token) — see SendConsentRequest.
// Only the PHOTO projection exists on participants, so other consent types are
// a no-op.
func (r *GormConsentRepository) clearConsentProjection(ctx context.Context, participantID string, consentType entity.ConsentType) error {
	if consentType != entity.ConsentPhoto {
		return nil
	}
	if uerr := r.db.WithContext(ctx).
		Model(&ParticipantModel{}).
		Where("id = ?", participantID).
		Updates(map[string]interface{}{
			"consent_photo": false,
			"consent_at":    nil,
		}).Error; uerr != nil {
		return apperrors.Internal("internal_error", uerr)
	}
	return nil
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

// ListConsentFlat returns a flat projection joining participants, sessions, and consent_logs.
func (r *GormConsentRepository) ListConsentFlat(ctx context.Context, tenantID string) ([]repository.ConsentFlatRow, error) {
	var rows []repository.ConsentFlatRow
	err := r.db.WithContext(ctx).Raw(`
		SELECT
			p.id AS participant_id,
			p.child_name,
			p.parent_name,
			p.parent_phone,
			s.id AS session_id,
			s.name AS session_name,
			CAST(s.session_date AS CHAR) AS session_date,
			s.location,
			s.program_name,
			CASE
				WHEN cl.id IS NOT NULL AND cl.value = 1 AND cl.responded_at IS NOT NULL THEN 'granted'
				WHEN cl.id IS NOT NULL AND cl.value = 0 AND cl.responded_at IS NOT NULL THEN 'denied'
				WHEN cl.id IS NOT NULL AND cl.responded_at IS NULL THEN 'pending'
				ELSE 'not_sent'
			END AS consent_status,
			cl.responded_at,
			cl.responder_name,
			CASE WHEN p.consent_combined_token IS NOT NULL AND p.consent_combined_token_expires_at > NOW() THEN 1 ELSE 0 END AS has_token
		FROM participants p
		JOIN sessions s ON p.session_id = s.id
		LEFT JOIN consent_logs cl ON cl.participant_id = p.id
			AND cl.session_id = s.id
			AND cl.consent_type = 'PHOTO'
		WHERE s.tenant_id = ?
			AND s.deleted_at IS NULL
			AND p.deleted_at IS NULL
		ORDER BY s.program_name, s.session_date DESC, p.child_name
	`, tenantID).Scan(&rows).Error
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return rows, nil
}

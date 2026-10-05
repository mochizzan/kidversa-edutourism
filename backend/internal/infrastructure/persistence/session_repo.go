package persistence

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormSessionRepository implements repository.SessionRepository.
type GormSessionRepository struct {
	db *gorm.DB
}

// NewSessionRepository builds a GORM-backed session repository.
func NewSessionRepository(db *gorm.DB) repository.SessionRepository {
	return &GormSessionRepository{db: db}
}

// Transaction runs fn inside a DB transaction, passing a repository bound to the tx.
func (r *GormSessionRepository) Transaction(ctx context.Context, fn func(tx repository.SessionRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&GormSessionRepository{db: tx})
	})
}

func (r *GormSessionRepository) CreateSession(ctx context.Context, s *entity.Session) error {
	// Denormalize: fetch program name if not set
	if s.ProgramName == "" && s.ProgramID != "" {
		var name string
		if err := r.db.WithContext(ctx).Model(&ProgramModel{}).Select("name").Where("id = ?", s.ProgramID).Scan(&name).Error; err == nil {
			s.ProgramName = name
		}
	}
	m := sessionModelFromEntity(s)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*s = *m.ToEntity()
	return nil
}

func (r *GormSessionRepository) GetSessionByID(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	var m SessionModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	// Tenant scoping: restrict to the caller's tenant unless tenantID is empty
	// (tenant-less SUPER_ADMIN scoped calls resolved by other means).
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

// GetSessionByIDForUpdate is GetSessionByID plus a SELECT ... FOR UPDATE row
// lock on the session row. The lock is what serializes CancelSession (#12) and
// the assessment upsert write (#14): each runs it inside its own transaction,
// so whichever side gets the lock first forces the other side to wait and then
// observe its committed status — a score can never land silently on a session
// that a concurrent cancel has already closed. Callers MUST run it inside
// Transaction; GORM would otherwise autocommit the statement and release the
// lock immediately, degrading it to an unlocked read.
func (r *GormSessionRepository) GetSessionByIDForUpdate(ctx context.Context, id, tenantID string) (*entity.Session, error) {
	var m SessionModel
	q := r.db.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ?", id)
	// Same tenant scoping contract as GetSessionByID.
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormSessionRepository) ListSessions(ctx context.Context, f repository.SessionFilter, page, limit int) (*repository.Paginated[entity.Session], error) {
	q := r.db.WithContext(ctx).
		Model(&SessionModel{}).
		Select("sessions.*, programs.name AS program_name").
		Joins("LEFT JOIN programs ON programs.id = sessions.program_id")
	if f.TenantID != "" {
		q = q.Where("sessions.tenant_id = ?", f.TenantID)
	}
	if f.Status != "" {
		q = q.Where("sessions.status = ?", f.Status)
	}
	if f.ProgramID != "" {
		q = q.Where("sessions.program_id = ?", f.ProgramID)
	}
	if f.SessionDate != "" {
		q = q.Where("sessions.session_date = ?", f.SessionDate)
	}
	if f.Search != "" {
		like := "%" + strings.ToLower(f.Search) + "%"
		q = q.Where("LOWER(sessions.name) LIKE ? OR LOWER(sessions.location) LIKE ?", like, like)
	}
	// When FacilitatorID is set, restrict to sessions where the facilitator
	// owns at least one session_group (group.facilitator_id is the single
	// source of truth under Opsi A; stage.facilitator_id is no longer assigned).
	if f.FacilitatorID != "" {
		q = q.Where(
			"sessions.id IN (SELECT session_id FROM session_groups WHERE facilitator_id = ?)",
			f.FacilitatorID,
		)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []SessionModel
	if err := paginate(q, page, limit, "session_date DESC, created_at DESC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Session, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	// Batched enrichment of the page (2 extra queries total, never N+1):
	// ordered Topik names and the Kegiatan count per session. Both queries run
	// on raw table names, so GORM's automatic deleted_at scope does NOT apply —
	// soft-deleted rows are filtered explicitly below.
	if len(models) > 0 {
		ids := make([]string, 0, len(models))
		index := make(map[string]int, len(models))
		for i := range items {
			ids = append(ids, items[i].ID)
			index[items[i].ID] = i
		}

		// Query 1: topics in clone order (st.created_at ASC, st.id tiebreak).
		// program_stage_name is the denormalized authority; older rows may have
		// it empty, so fall back to the joined program_stages.name.
		type topicRow struct {
			SessionID string `gorm:"column:session_id"`
			Name      string `gorm:"column:name"`
		}
		var topicRows []topicRow
		if err := r.db.WithContext(ctx).
			Table("session_stages AS st").
			Select("st.session_id, COALESCE(NULLIF(st.program_stage_name, ''), ps.name) AS name").
			Joins("LEFT JOIN program_stages AS ps ON ps.id = st.program_stage_id").
			Where("st.session_id IN ?", ids).
			Where("st.deleted_at IS NULL").
			Order("st.created_at ASC, st.id ASC").
			Find(&topicRows).Error; err != nil {
			return nil, apperrors.Internal("internal_error", err)
		}
		for _, tr := range topicRows {
			if i, ok := index[tr.SessionID]; ok {
				items[i].Topics = append(items[i].Topics, tr.Name)
			}
		}

		// Query 2: Kegiatan count per session, grouped; sessions absent from the
		// result have zero live substages.
		type countRow struct {
			SessionID string `gorm:"column:session_id"`
			Cnt       int    `gorm:"column:cnt"`
		}
		var countRows []countRow
		if err := r.db.WithContext(ctx).
			Table("session_substages").
			Select("session_id, COUNT(*) AS cnt").
			Where("session_id IN ?", ids).
			Where("deleted_at IS NULL").
			Group("session_id").
			Find(&countRows).Error; err != nil {
			return nil, apperrors.Internal("internal_error", err)
		}
		for i := range items {
			n := 0
			items[i].ActivityCount = &n
		}
		for _, cr := range countRows {
			if i, ok := index[cr.SessionID]; ok {
				n := cr.Cnt
				items[i].ActivityCount = &n
			}
		}
	}
	return &repository.Paginated[entity.Session]{Items: items, Total: int(total)}, nil
}

func (r *GormSessionRepository) UpdateSession(ctx context.Context, s *entity.Session) error {
	m := sessionModelFromEntity(s)
	if err := r.db.WithContext(ctx).Model(&SessionModel{}).Where("id = ?", s.ID).Updates(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// purgeSessionRows hard-deletes one session row together with its children
// inside tx. Schema audit of migrations 000001/000002:
//   - Tables carrying session_id WITHOUT an FK to sessions
//     (group_stage_progress_history, timeline_events, gallery_tokens) are
//     purged manually so no row keeps pointing at the session.
//   - Tables with FK ON DELETE CASCADE (session_stages, session_substages,
//     session_groups, reports, assessments, participant_attendance,
//     report_photo_picks, smart_photos, consent_logs,
//     participant_session_memberships) are cleaned by the physical session
//     delete itself — and gallery_tokens also cascades via reports.
//   - participants.session_id is FK ON DELETE SET NULL: participants survive
//     unassigned instead of being destroyed, which protects their history in
//     other sessions (multi-session membership rows are per-session and die
//     via CASCADE).
func purgeSessionRows(tx *gorm.DB, sessionID string) error {
	for _, table := range []string{"group_stage_progress_history", "timeline_events", "gallery_tokens"} {
		if err := tx.Exec("DELETE FROM "+table+" WHERE session_id = ?", sessionID).Error; err != nil {
			return apperrors.Internal("internal_error", err)
		}
	}
	if err := tx.Unscoped().Delete(&SessionModel{}, "id = ?", sessionID).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormSessionRepository) DeleteSession(ctx context.Context, id string) error {
	// Hard delete in ONE transaction (see purgeSessionRows): the old
	// Unscoped-only delete left the no-FK children orphaned, and a GORM
	// soft delete would never fire any cascade at all.
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return purgeSessionRows(tx, id)
	})
}

// --- Session stages ---

func (r *GormSessionRepository) CreateSessionStage(ctx context.Context, s *entity.SessionStage) error {
	// Denormalize: fetch program stage name if not set
	if s.ProgramStageName == "" && s.ProgramStageID != "" {
		var name string
		if err := r.db.WithContext(ctx).Model(&ProgramStageModel{}).Select("name").Where("id = ?", s.ProgramStageID).Scan(&name).Error; err == nil {
			s.ProgramStageName = name
		}
	}
	m := sessionStageModelFromEntity(s)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*s = *m.ToEntity()
	return nil
}

func (r *GormSessionRepository) ListSessionStages(ctx context.Context, sessionID string) ([]entity.SessionStage, error) {
	var models []SessionStageModel
	if err := r.db.WithContext(ctx).Where("session_id = ?", sessionID).Order("created_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.SessionStage, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionRepository) UpdateSessionStage(ctx context.Context, s *entity.SessionStage) error {
	m := sessionStageModelFromEntity(s)
	// Stage facilitator is derived from the owning group (Opsi A); the stage's own
	// facilitator_id column is no longer written. Only status/updated_at are updated.
	if err := r.db.WithContext(ctx).
		Model(&SessionStageModel{}).
		Where("id = ?", s.ID).
		Select("Status", "UpdatedAt").
		Updates(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// --- Session groups ---

func (r *GormSessionRepository) CreateSessionGroup(ctx context.Context, g *entity.SessionGroup) error {
	m := sessionGroupModelFromEntity(g)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*g = *m.ToEntity()
	return nil
}

func (r *GormSessionRepository) GetSessionGroupByID(ctx context.Context, id, tenantID string) (*entity.SessionGroup, error) {
	var m SessionGroupModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	// Tenant scoping: restrict to the session's owning tenant (resolved via the
	// group's session) unless tenantID is empty (tenant-less SUPER_ADMIN).
	if tenantID != "" {
		q = scopeByTenant(q, tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormSessionRepository) ListSessionGroups(ctx context.Context, sessionID string) ([]entity.SessionGroup, error) {
	var models []SessionGroupModel
	if err := r.db.WithContext(ctx).Where("session_id = ?", sessionID).Order("created_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.SessionGroup, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionRepository) UpdateSessionGroup(ctx context.Context, g *entity.SessionGroup) error {
	m := sessionGroupModelFromEntity(g)
	// Select forces FacilitatorID into the UPDATE even when nil (so clearing it
	// produces SET facilitator_id = NULL; GORM otherwise skips zero-value fields).
	if err := r.db.WithContext(ctx).
		Model(&SessionGroupModel{}).
		Where("id = ?", g.ID).
		Select("Name", "Status", "FacilitatorID", "UpdatedAt").
		Updates(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormSessionRepository) DeleteSessionGroup(ctx context.Context, id string) error {
	// Hard delete in ONE transaction: group_stage_progress cascades via its FK
	// on the physical row removal; group_stage_progress_history and
	// timeline_events carry group_id WITHOUT an FK → purged manually; members
	// keep their rows — participants.group_id and memberships.group_id are FK
	// ON DELETE SET NULL, so they simply become ungrouped (schema-designed).
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, table := range []string{"group_stage_progress_history", "timeline_events"} {
			if err := tx.Exec("DELETE FROM "+table+" WHERE group_id = ?", id).Error; err != nil {
				return apperrors.Internal("internal_error", err)
			}
		}
		if err := tx.Unscoped().Delete(&SessionGroupModel{}, "id = ?", id).Error; err != nil {
			return apperrors.Internal("internal_error", err)
		}
		return nil
	})
}

// --- Group stage progress ---

func (r *GormSessionRepository) CreateGroupStageProgress(ctx context.Context, p *entity.GroupStageProgress) error {
	m := groupStageProgressModelFromEntity(p)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*p = *m.ToEntity()
	return nil
}

func (r *GormSessionRepository) ListGroupStageProgress(ctx context.Context, sessionSubstageID string) ([]entity.GroupStageProgress, error) {
	var models []GroupStageProgressModel
	if err := r.db.WithContext(ctx).Where("session_substage_id = ?", sessionSubstageID).Order("created_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.GroupStageProgress, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionRepository) ListGroupStageProgressByGroup(ctx context.Context, groupID string) ([]entity.GroupStageProgress, error) {
	var models []GroupStageProgressModel
	if err := r.db.WithContext(ctx).Where("group_id = ?", groupID).Order("created_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.GroupStageProgress, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

// --- Participants ---

func (r *GormSessionRepository) CreateParticipant(ctx context.Context, p *entity.Participant) error {
	// Denormalize: fetch session name if not set
	if p.SessionName == "" && p.SessionID != nil && *p.SessionID != "" {
		var name string
		if err := r.db.WithContext(ctx).Model(&SessionModel{}).Select("name").Where("id = ?", *p.SessionID).Scan(&name).Error; err == nil {
			p.SessionName = name
		}
	}
	m := participantModelFromEntity(p)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*p = *m.ToEntity()
	return nil
}

func (r *GormSessionRepository) GetParticipantByID(ctx context.Context, id, tenantID string) (*entity.Participant, error) {
	var m ParticipantModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

// ParticipantNameExists reports whether a live participant with exactly this
// child_name already exists, scoped to tenantID when non-empty (soft-deleted
// rows are excluded by the model's DeletedAt). Powers the duplicate-name
// rejection on create without requiring a unique index.
func (r *GormSessionRepository) ParticipantNameExists(ctx context.Context, tenantID, childName string) (bool, error) {
	var n int64
	q := r.db.WithContext(ctx).Model(&ParticipantModel{}).Where("child_name = ?", childName)
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}
	if err := q.Count(&n).Error; err != nil {
		return false, apperrors.Internal("internal_error", err)
	}
	return n > 0, nil
}

// GetParticipantGlobal returns a single participant by id, tenant-scoped (the
// tenant filter is skipped for tenant-less SUPER_ADMIN calls when tenantID == "").
func (r *GormSessionRepository) GetParticipantGlobal(ctx context.Context, id, tenantID string) (*entity.Participant, error) {
	var m ParticipantModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

// participantScopeCondition builds the pointer ∪ membership-history WHERE
// fragment shared by ListParticipants and ListParticipantsPaginated. A row
// matches when the participant's CURRENT pointer (participants.session_id /
// group_id) satisfies the session/group filters, OR when a recorded history
// row (participant_session_memberships) for that participant satisfies them —
// both branches project the same single participants row, so the result is
// structurally deduplicated per participant_id: in the A → B → A case the
// pointer row wins because the history branch can never add a second copy of
// it. Returns "" when neither filter is set.
func participantScopeCondition(sessionID, groupID string) (string, []interface{}) {
	if sessionID == "" && groupID == "" {
		return "", nil
	}
	ptr := make([]string, 0, 2)
	ptrArgs := make([]interface{}, 0, 2)
	hist := []string{"m.participant_id = participants.id"}
	histArgs := make([]interface{}, 0, 2)
	if sessionID != "" {
		ptr = append(ptr, "session_id = ?")
		ptrArgs = append(ptrArgs, sessionID)
		hist = append(hist, "m.session_id = ?")
		histArgs = append(histArgs, sessionID)
	}
	if groupID != "" {
		ptr = append(ptr, "group_id = ?")
		ptrArgs = append(ptrArgs, groupID)
		hist = append(hist, "m.group_id = ?")
		histArgs = append(histArgs, groupID)
	}
	cond := "(" + strings.Join(ptr, " AND ") +
		" OR EXISTS (SELECT 1 FROM participant_session_memberships m WHERE " +
		strings.Join(hist, " AND ") + "))"
	// Placeholder order follows the SQL text: pointer branch first, then EXISTS.
	args := append(ptrArgs, histArgs...)
	return cond, args
}

func (r *GormSessionRepository) ListParticipants(ctx context.Context, sessionID, groupID, tenantID string) ([]entity.Participant, error) {
	q := r.db.WithContext(ctx).Model(&ParticipantModel{})
	if cond, condArgs := participantScopeCondition(sessionID, groupID); cond != "" {
		q = q.Where(cond, condArgs...)
	}
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}
	var models []ParticipantModel
	if err := q.Order("created_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Participant, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

// CountActiveGroupMembers counts a group's CURRENT members for the capacity
// check (group_full): participants whose pointer columns target the given
// (sessionID, groupID). Unlike ListParticipants it never unions
// participant_session_memberships history — a row that only appears in the
// history (the member has since moved to another session) does not occupy
// capacity here (audit #10). An empty sessionID counts by group pointer only.
func (r *GormSessionRepository) CountActiveGroupMembers(ctx context.Context, sessionID, groupID string) (int, error) {
	q := r.db.WithContext(ctx).Model(&ParticipantModel{})
	if sessionID != "" {
		q = q.Where("session_id = ?", sessionID)
	}
	if groupID != "" {
		q = q.Where("group_id = ?", groupID)
	}
	var n int64
	if err := q.Count(&n).Error; err != nil {
		return 0, apperrors.Internal("internal_error", err)
	}
	return int(n), nil
}

// ListParticipantsPaginated returns a tenant-scoped, paginated participant list
// (global /api/participants). Supports optional session_id/group_id filters and a
// case-insensitive search across child_name/parent_name/school_name.
func (r *GormSessionRepository) ListParticipantsPaginated(ctx context.Context, tenantID, sessionID, groupID, search string, page, limit int) (*repository.Paginated[entity.Participant], error) {
	q := r.db.WithContext(ctx).Model(&ParticipantModel{})
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}
	if cond, condArgs := participantScopeCondition(sessionID, groupID); cond != "" {
		q = q.Where(cond, condArgs...)
	}
	if search != "" {
		like := "%" + strings.ToLower(search) + "%"
		q = q.Where("LOWER(child_name) LIKE ? OR LOWER(parent_name) LIKE ? OR LOWER(school_name) LIKE ?", like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []ParticipantModel
	if err := paginate(q, page, limit, "created_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Participant, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.Participant]{Items: items, Total: int(total)}, nil
}

// RecordMembership writes one participant ↔ session history row. The insert is
// idempotent against UNIQUE(participant_id, session_id): a repeated record
// (link retry, A → B → A round trip) keeps the existing row instead of
// failing the link.
func (r *GormSessionRepository) RecordMembership(ctx context.Context, m *entity.ParticipantSessionMembership) error {
	mm := participantSessionMembershipModelFromEntity(m)
	if err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(mm).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	*m = *mm.ToEntity()
	return nil
}

// ListSessionMemberships returns the recorded history rows of one session,
// tenant-scoped, ordered by joined_at.
func (r *GormSessionRepository) ListSessionMemberships(ctx context.Context, sessionID, tenantID string) ([]entity.ParticipantSessionMembership, error) {
	q := r.db.WithContext(ctx).Where("session_id = ?", sessionID)
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}
	var models []ParticipantSessionMembershipModel
	if err := q.Order("joined_at ASC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.ParticipantSessionMembership, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return items, nil
}

func (r *GormSessionRepository) UpdateParticipant(ctx context.Context, p *entity.Participant) error {
	m := participantModelFromEntity(p)
	if err := r.db.WithContext(ctx).Model(&ParticipantModel{}).Where("id = ?", p.ID).Updates(m).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	// Denormalize: sync participant_name in all assessments referencing this participant
	r.db.WithContext(ctx).Model(&AssessmentModel{}).Where("participant_id = ?", p.ID).Update("participant_name", p.ChildName)
	return nil
}

// UpdateParticipantFields applies a partial (map) update so zero/false values
// persist (GORM zero-value bug, C2).
func (r *GormSessionRepository) UpdateParticipantFields(ctx context.Context, id string, fields map[string]interface{}) error {
	if err := r.db.WithContext(ctx).Model(&ParticipantModel{}).Where("id = ?", id).Updates(fields).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// UpdateParticipantTokenIfAvailable atomically sets a combined consent token only
// if no active token currently exists. Returns (true, nil) on success, (false, nil)
// if the token slot is already occupied by a concurrent request.
func (r *GormSessionRepository) UpdateParticipantTokenIfAvailable(ctx context.Context, participantID string, token string, expiresAt interface{}) (bool, error) {
	result := r.db.WithContext(ctx).
		Model(&ParticipantModel{}).
		Where("id = ? AND (consent_combined_token IS NULL OR consent_combined_token_expires_at < ?)", participantID, time.Now()).
		Updates(map[string]interface{}{
			"consent_combined_token":            token,
			"consent_combined_token_expires_at": expiresAt,
		})
	if result.Error != nil {
		return false, apperrors.Internal("internal_error", result.Error)
	}
	return result.RowsAffected > 0, nil
}

// ClearParticipantTokens clears active combined consent tokens for a session's
// participants (force-resend recovery), so the eligibility filter re-includes them.
func (r *GormSessionRepository) ClearParticipantTokens(ctx context.Context, sessionID, tenantID string) error {
	return r.db.WithContext(ctx).
		Model(&ParticipantModel{}).
		Where("session_id = ? AND tenant_id = ? AND consent_combined_token IS NOT NULL", sessionID, tenantID).
		Updates(map[string]interface{}{
			"consent_combined_token":            nil,
			"consent_combined_token_expires_at": nil,
		}).Error
}

func (r *GormSessionRepository) DeleteParticipant(ctx context.Context, id string) error {
	// Guard: refuse to delete a participant that is still operationally linked or
	// has child records. This mirrors the frontend parity intent — a participant
	// that still carries session/group membership or assessment/photo/
	// report/consent data must be unlinked/cleared first (or archived), not dropped
	// outright, to avoid dangling foreign keys and lost history.
	var p ParticipantModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&p).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperrors.NotFound("not_found", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	if p.SessionID != nil || p.GroupID != nil {
		return apperrors.Conflict("participant_not_deletable", nil)
	}
	// Count child rows referencing this participant across the content tables.
	// Tables created later (B15) are skipped gracefully until they exist.
	childTables := []struct {
		table string
		col   string
	}{
		{"smart_photos", "participant_id"},
		{"assessments", "participant_id"},
		{"reports", "participant_id"},
		{"consent_logs", "participant_id"},
	}
	for _, ct := range childTables {
		exists, err := tableExists(ctx, r.db, ct.table)
		if err != nil {
			return apperrors.Internal("internal_error", err)
		}
		if !exists {
			continue
		}
		var n int64
		if err := r.db.WithContext(ctx).Table(ct.table).Where(ct.col+" = ?", id).Count(&n).Error; err != nil {
			return apperrors.Internal("internal_error", err)
		}
		if n > 0 {
			return apperrors.Conflict("participant_not_deletable", nil)
		}
	}
	// Safe to soft-delete (auditable; matches existing behaviour otherwise).
	if err := r.db.WithContext(ctx).Delete(&ParticipantModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// tableExists reports whether a table is present in the current database.
func tableExists(ctx context.Context, db *gorm.DB, name string) (bool, error) {
	var cnt int64
	if err := db.WithContext(ctx).
		Table("information_schema.tables").
		Where("table_schema = DATABASE() AND table_name = ?", name).
		Count(&cnt).Error; err != nil {
		return false, err
	}
	return cnt > 0, nil
}

func (r *GormSessionRepository) FindParticipantSessionInfo(ctx context.Context, participantIDs []string, tenantID string) ([]repository.ParticipantSessionInfo, error) {
	if len(participantIDs) == 0 {
		return nil, nil
	}

	type resultRow struct {
		entity.Participant
		SessionName string `gorm:"column:session_name"`
		ProgramID   string `gorm:"column:program_id"`
	}

	var rows []resultRow
	q := r.db.WithContext(ctx).
		Table("participants AS p").
		Select("p.*, s.name AS session_name, s.program_id AS program_id").
		Joins("LEFT JOIN sessions AS s ON s.id = p.session_id AND s.deleted_at IS NULL").
		Where("p.id IN ?", participantIDs)
	if tenantID != "" {
		q = q.Where("p.tenant_id = ?", tenantID)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}

	out := make([]repository.ParticipantSessionInfo, 0, len(rows))
	for _, r := range rows {
		out = append(out, repository.ParticipantSessionInfo{
			Participant: r.Participant,
			SessionName: r.SessionName,
			SessionID:   r.Participant.SessionIDValue(),
			ProgramID:   r.ProgramID,
		})
	}
	return out, nil
}

func (r *GormSessionRepository) ListParticipantsForProgram(ctx context.Context, programID, tenantID string) ([]repository.ParticipantSessionInfo, error) {
	type resultRow struct {
		entity.Participant
		SessionName string `gorm:"column:session_name"`
		ProgramID   string `gorm:"column:program_id"`
	}

	var rows []resultRow
	q := r.db.WithContext(ctx).
		Table("participants AS p").
		Select("p.*, s.name AS session_name, s.program_id AS program_id").
		Joins("INNER JOIN sessions AS s ON s.id = p.session_id AND s.deleted_at IS NULL").
		Where("s.program_id = ?", programID)
	if tenantID != "" {
		q = q.Where("p.tenant_id = ?", tenantID)
	}
	if err := q.Order("p.created_at ASC").Find(&rows).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}

	out := make([]repository.ParticipantSessionInfo, 0, len(rows))
	for _, r := range rows {
		out = append(out, repository.ParticipantSessionInfo{
			Participant: r.Participant,
			SessionName: r.SessionName,
			SessionID:   r.Participant.SessionIDValue(),
			ProgramID:   r.ProgramID,
		})
	}
	return out, nil
}

func (r *GormSessionRepository) FindDuplicateParticipants(ctx context.Context, programID, tenantID string, rows []repository.ParticipantInput) ([]repository.DuplicateParticipantInfo, error) {
	if len(rows) == 0 || programID == "" {
		return nil, nil
	}

	type dupRow struct {
		ParticipantID string `gorm:"column:participant_id"`
		ChildName     string `gorm:"column:child_name"`
		ParentPhone   string `gorm:"column:parent_phone"`
		SessionName   string `gorm:"column:session_name"`
	}

	// One query instead of N: match every import row at once via a row-value IN
	// on (LOWER(child_name), LOWER(parent_phone), program_id, tenant_id).
	var tupleArgs []interface{}
	var tuples strings.Builder
	for i, row := range rows {
		if i > 0 {
			tuples.WriteString(", ")
		}
		if tenantID != "" {
			tuples.WriteString("(LOWER(?), LOWER(?), ?, ?)")
			tupleArgs = append(tupleArgs, row.ChildName, row.ParentPhone, programID, tenantID)
		} else {
			tuples.WriteString("(LOWER(?), LOWER(?), ?)")
			tupleArgs = append(tupleArgs, row.ChildName, row.ParentPhone, programID)
		}
	}
	tupleCols := "LOWER(p.child_name), LOWER(p.parent_phone), s.program_id"
	if tenantID != "" {
		tupleCols += ", p.tenant_id"
	}
	inClause := "(" + tupleCols + ") IN (" + tuples.String() + ")"

	var dupRows []dupRow
	if err := r.db.WithContext(ctx).
		Table("participants AS p").
		Select("p.id AS participant_id, p.child_name, p.parent_phone, s.name AS session_name").
		Joins("INNER JOIN sessions AS s ON s.id = p.session_id AND s.deleted_at IS NULL").
		Where(inClause, tupleArgs...).
		Find(&dupRows).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}

	out := make([]repository.DuplicateParticipantInfo, 0, len(dupRows))
	for _, d := range dupRows {
		out = append(out, repository.DuplicateParticipantInfo{
			ParticipantID:   d.ParticipantID,
			ChildName:       d.ChildName,
			ParentPhone:     d.ParentPhone,
			ExistingSession: d.SessionName,
		})
	}
	return out, nil
}

// TenantIDForSession resolves the owning tenant of a session (media scope checks).
func (r *GormSessionRepository) TenantIDForSession(ctx context.Context, sessionID string) (string, error) {
	var tid string
	if err := r.db.WithContext(ctx).Raw(
		"SELECT tenant_id FROM sessions WHERE id = ? AND deleted_at IS NULL LIMIT 1",
		sessionID,
	).Scan(&tid).Error; err != nil {
		return "", apperrors.Internal("internal_error", err)
	}
	return tid, nil
}

// GetGroupFacilitatorID returns the facilitator_id of a session group, or nil if
// the group is unassigned / not found. Used for facilitator ownership checks.
func (r *GormSessionRepository) GetGroupFacilitatorID(ctx context.Context, groupID string) (*string, error) {
	var fid sql.NullString
	if err := r.db.WithContext(ctx).
		Table("session_groups").
		Select("facilitator_id").
		Where("id = ?", groupID).
		Scan(&fid).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	if !fid.Valid || fid.String == "" {
		return nil, nil
	}
	v := fid.String
	return &v, nil
}

// FacilitatorOwnsAnyGroup reports whether the facilitator owns at least one group
// in the given session. Used to gate kiosk issuance to group owners.
func (r *GormSessionRepository) FacilitatorOwnsAnyGroup(ctx context.Context, sessionID, facilitatorID string) (bool, error) {
	var n int64
	if err := r.db.WithContext(ctx).
		Table("session_groups").
		Where("session_id = ? AND facilitator_id = ?", sessionID, facilitatorID).
		Count(&n).Error; err != nil {
		return false, apperrors.Internal("internal_error", err)
	}
	return n > 0, nil
}

// GetSessionGroupByParticipant resolves the session group a participant belongs to
// (participants.group_id -> session_groups). Returns (nil, nil) when the participant
// has no group. Used to lock attendance/grading writes on COMPLETED groups.
func (r *GormSessionRepository) GetSessionGroupByParticipant(ctx context.Context, participantID string) (*entity.SessionGroup, error) {
	var m SessionGroupModel
	if err := r.db.WithContext(ctx).
		Table("participants AS p").
		Select("sg.*").
		Joins("LEFT JOIN session_groups AS sg ON sg.id = p.group_id").
		Where("p.id = ?", participantID).
		Limit(1).
		Scan(&m).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	if m.ID == "" {
		return nil, nil
	}
	return m.ToEntity(), nil
}

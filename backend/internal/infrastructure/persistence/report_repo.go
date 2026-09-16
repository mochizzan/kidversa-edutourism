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
	"kidversa-edutourism-backend/internal/pkg/util"
)

// GormReportRepository implements repository.ReportRepository.
type GormReportRepository struct {
	db *gorm.DB
}

// NewReportRepository builds a GORM-backed report repository.
func NewReportRepository(db *gorm.DB) repository.ReportRepository {
	return &GormReportRepository{db: db}
}

func (r *GormReportRepository) Create(ctx context.Context, rep *entity.Report) error {
	// Denormalize: fetch group name from participant's group if not set
	if rep.GroupName == "" && rep.ParticipantID != "" {
		var groupName string
		if err := r.db.WithContext(ctx).
			Select("sg.name").
			Joins("LEFT JOIN session_groups sg ON sg.id = p.group_id").
			Table("participants p").
			Where("p.id = ?", rep.ParticipantID).
			Scan(&groupName).Error; err == nil {
			rep.GroupName = groupName
		}
	}
	m := reportModelFromEntity(rep)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*rep = *m.ToEntity()
	return nil
}

func (r *GormReportRepository) GetOrCreateDraft(ctx context.Context, participantID, sessionID, programStageID string) (*entity.Report, error) {
	var res *entity.Report
	err := InTx(ctx, r.db, func(tx *gorm.DB) error {
		m := &ReportModel{
			Report: entity.Report{
				ParticipantID:  participantID,
				SessionID:      sessionID,
				ProgramStageID: programStageID,
				Status:         entity.ReportDraft,
			},
		}
		tok, terr := util.RandomToken()
		if terr != nil {
			return apperrors.Internal("internal_error", terr)
		}
		m.ParentAccessToken = tok
		// Atomic: if (session_id, participant_id, program_stage_id) already exists,
		// the insert is skipped (ON CONFLICT DO NOTHING on
		// uq_reports_session_participant_topic), avoiding the TOCTOU of the old
		// List->Create pattern. A NULL program_stage_id (legacy whole-session report)
		// also participates in the unique key, so at most one legacy row exists per
		// (session, participant).
		if cerr := tx.
			Clauses(clause.OnConflict{DoNothing: true}).
			Create(m).Error; cerr != nil {
			return apperrors.Internal("internal_error", cerr)
		}
		var got ReportModel
		if ferr := tx.
			Unscoped().
			Where("session_id = ? AND participant_id = ? AND (program_stage_id <=> ?)", sessionID, participantID, programStageID).
			First(&got).Error; ferr != nil {
			if errors.Is(ferr, gorm.ErrRecordNotFound) {
				// True absence: create using the ORIGINALLY-built m (NOT the zero-value got) — A4 errata.
				if cerr := tx.Create(m).Error; cerr != nil {
					return apperrors.Internal("internal_error", cerr)
				}
				got = *m
			} else {
				return apperrors.Internal("internal_error", ferr)
			}
		}
		if got.DeletedAt.Valid {
			// Tombstone: reactivate (free the physical unique slot, reset draft state).
			if uerr := tx.
				Model(&ReportModel{}).
				Where("id = ?", got.ID).
				Updates(map[string]interface{}{
					"deleted_at":         gorm.DeletedAt{},
					"status":             entity.ReportDraft,
					"ai_narrative_draft": "",
					"ai_narrative_final": "",
				}).Error; uerr != nil {
				return apperrors.Internal("internal_error", uerr)
			}
			if rerr := tx.Where("id = ?", got.ID).First(&got).Error; rerr != nil {
				return apperrors.Internal("internal_error", rerr)
			}
		}
		e := got.ToEntity()
		reports := []entity.Report{*e}
		if lerr := r.loadMissionIDs(ctx, reports); lerr != nil {
			return apperrors.Internal("internal_error", lerr)
		}
		// Denormalize: fetch group name if empty
		if reports[0].GroupName == "" {
			var groupName string
			if err := tx.
				Select("sg.name").
				Joins("LEFT JOIN session_groups sg ON sg.id = p.group_id").
				Table("participants p").
				Where("p.id = ?", got.ParticipantID).
				Scan(&groupName).Error; err == nil {
				reports[0].GroupName = groupName
				tx.Model(&ReportModel{}).Where("id = ?", got.ID).Update("group_name", groupName)
			}
		}
		res = &reports[0]
		return nil
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

// missionIDRow is a lightweight projection of participant_missions used only to
// derive each report's MissionIDs (avoids scanning full entity rows).
type missionIDRow struct {
	ReportID      string `gorm:"column:report_id"`
	MissionBankID string `gorm:"column:mission_bank_id"`
}

// loadMissionIDs fills each report's derived MissionIDs from participant_missions.
func (r *GormReportRepository) loadMissionIDs(ctx context.Context, reports []entity.Report) error {
	if len(reports) == 0 {
		return nil
	}
	ids := make([]string, 0, len(reports))
	for i := range reports {
		ids = append(ids, reports[i].ID)
	}
	var rows []missionIDRow
	if err := r.db.WithContext(ctx).Table("participant_missions").
		Select("report_id, mission_bank_id").
		Where("report_id IN ?", ids).
		Scan(&rows).Error; err != nil {
		return err
	}
	byReport := make(map[string][]string, len(reports))
	for _, row := range rows {
		byReport[row.ReportID] = append(byReport[row.ReportID], row.MissionBankID)
	}
	for i := range reports {
		reports[i].MissionIDs = byReport[reports[i].ID]
	}
	return nil
}

func (r *GormReportRepository) GetByID(ctx context.Context, id, tenantID string) (*entity.Report, error) {
	var m ReportModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	// Tenant scoping: SUPER_ADMIN tanpa active tenant (tenantID == "") TIDAK BOLEH
	// mengakses report dari tenant manapun. Ini mencegah IDOR.
	// Request dengan tenantID kosong akan ditolak di middleware layer (TenantScope)
	// sebelum mencapai repository, tapi kita tetap validate di sini sebagai defense-in-depth.
	if tenantID == "" {
		return nil, apperrors.BadRequest("tenant_required", errors.New("tenant ID is required"))
	}
	q = scopeByTenant(q, tenantID)
	if err := q.First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	e := m.ToEntity()
	reports := []entity.Report{*e}
	if err := r.loadMissionIDs(ctx, reports); err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	*e = reports[0]
	return e, nil
}

// GetByIDPublic fetches a report by ID without tenant scoping.
// Used by the gallery handler where the gallery token is the sole access control.
func (r *GormReportRepository) GetByIDPublic(ctx context.Context, id string) (*entity.Report, error) {
	var m ReportModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	e := m.ToEntity()
	reports := []entity.Report{*e}
	if err := r.loadMissionIDs(ctx, reports); err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	*e = reports[0]
	return e, nil
}

// GetByToken resolves a report only if the parent token is valid: present,
// not revoked, and not expired. Anti-IDOR: the token is unguessable (64hex).
func (r *GormReportRepository) GetByToken(ctx context.Context, token string) (*entity.Report, error) {
	var m ReportModel
	if err := r.db.WithContext(ctx).Where("parent_access_token = ?", token).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("token_invalid", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	if m.ParentTokenRevoked {
		return nil, apperrors.Forbidden("token_invalid", errors.New("token revoked"))
	}
	if m.ParentTokenExpiresAt != nil {
		if time.Now().After(*m.ParentTokenExpiresAt) {
			return nil, apperrors.Forbidden("token_expired", errors.New("token expired"))
		}
	}
	e := m.ToEntity()
	reports := []entity.Report{*e}
	if err := r.loadMissionIDs(ctx, reports); err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	*e = reports[0]
	return e, nil
}

func (r *GormReportRepository) List(ctx context.Context, f repository.ReportFilter, page, limit int) (*repository.Paginated[entity.Report], error) {
	q := r.db.WithContext(ctx).Model(&ReportModel{})
	if f.ParticipantID != "" {
		q = q.Where("participant_id = ?", f.ParticipantID)
	}
	if f.SessionID != "" {
		q = q.Where("session_id = ?", f.SessionID)
	}
	if f.ProgramStageID != "" {
		q = q.Where("program_stage_id = ?", f.ProgramStageID)
	}
	if f.TenantID != "" {
		q = scopeByTenant(q, f.TenantID)
	}
	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	var models []ReportModel
	if err := paginate(q, page, limit, "created_at DESC").Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.Report, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	if err := r.loadMissionIDs(ctx, items); err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return &repository.Paginated[entity.Report]{Items: items, Total: int(total)}, nil
}

func (r *GormReportRepository) Update(ctx context.Context, rep *entity.Report) error {
	m := reportModelFromEntity(rep)
	if err := r.db.WithContext(ctx).Model(&ReportModel{}).Where("id = ?", rep.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// Delete hard-deletes a report so the physical (session_id, participant_id)
// unique slot is freed. A soft-delete would leave the tombstone occupying the
// slot (uq_reports_session_participant is a physical unique index), blocking a
// later GenerateForSession for that participant with ER_DUP_ENTRY (409).
func (r *GormReportRepository) Delete(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Unscoped().Delete(&ReportModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

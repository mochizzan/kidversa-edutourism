package assessment

import (
	"context"

	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apputil "kidversa-edutourism-backend/internal/pkg/util"
)

// Usecase implements assessment business logic (upsert + list).
type Usecase struct {
	repo repository.AssessmentRepository
}

// NewUsecase builds the assessment usecase.
func NewUsecase(repo repository.AssessmentRepository) *Usecase {
	return &Usecase{repo: repo}
}

// Upsert creates or updates an assessment keyed on (participant_id, session_stage_id).
func (u *Usecase) Upsert(ctx context.Context, req repository.AssessmentFilter, starRating int, comment, assessedBy, assessedAt, syncStatus string) (*entity.Assessment, error) {
	if req.ParticipantID == "" || req.SessionStageID == "" {
		return nil, apperrors.BadRequest("validation_error", nil)
	}
	existing, err := u.repo.GetByParticipantStage(ctx, req.ParticipantID, req.SessionStageID)
	if err == nil && existing != nil {
		existing.StarRating = starRating
		if comment != "" {
			existing.Comment = comment
		}
		if assessedBy != "" {
			existing.AssessedBy = assessedBy
		}
		if assessedAt != "" {
			existing.AssessedAt = assessedAt
		}
		if syncStatus != "" {
			existing.SyncStatus = entity.SyncStatus(syncStatus)
		}
		if err := u.repo.Update(ctx, existing); err != nil {
			return nil, err
		}
		return existing, nil
	}
	a := &entity.Assessment{
		ParticipantID:  req.ParticipantID,
		SessionID:      req.SessionID,
		SessionStageID: req.SessionStageID,
		StarRating:     starRating,
		Comment:        comment,
		AssessedBy:     assessedBy,
		AssessedAt:     assessedAt,
		SyncStatus:     entity.SyncStatus(syncStatus),
	}
	if a.AssessedAt == "" {
		a.AssessedAt = apputil.NowISO()
	}
	if a.SyncStatus == "" {
		a.SyncStatus = entity.SyncLocal
	}
	if err := u.repo.Create(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

// BulkUpsert upserts many assessments.
func (u *Usecase) BulkUpsert(ctx context.Context, items []entity.Assessment) ([]entity.Assessment, error) {
	out := make([]entity.Assessment, 0, len(items))
	for i := range items {
		it := items[i]
		res, err := u.Upsert(ctx,
			repository.AssessmentFilter{ParticipantID: it.ParticipantID, SessionID: it.SessionID, SessionStageID: it.SessionStageID},
			it.StarRating, it.Comment, it.AssessedBy, it.AssessedAt, string(it.SyncStatus))
		if err != nil {
			return nil, err
		}
		out = append(out, *res)
	}
	return out, nil
}

// List returns assessments matching the filter (paginated).
func (u *Usecase) List(ctx context.Context, f repository.AssessmentFilter, page, limit int) (*repository.Paginated[entity.Assessment], error) {
	return u.repo.List(ctx, f, page, limit)
}

// Delete removes an assessment by id.
func (u *Usecase) Delete(ctx context.Context, id string) error {
	return u.repo.Delete(ctx, id)
}

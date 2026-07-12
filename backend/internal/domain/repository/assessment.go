package repository

import (
	"context"

	"kidversa-edutourism-backend/internal/domain/entity"
)

// AssessmentFilter narrows an assessment list query.
type AssessmentFilter struct {
	ParticipantID  string
	SessionID      string
	SessionStageID string
}

// AssessmentRepository is the persistence contract for assessments.
type AssessmentRepository interface {
	Create(ctx context.Context, a *entity.Assessment) error
	GetByID(ctx context.Context, id string) (*entity.Assessment, error)
	GetByParticipantStage(ctx context.Context, participantID, sessionStageID string) (*entity.Assessment, error)
	List(ctx context.Context, f AssessmentFilter, page, limit int) (*Paginated[entity.Assessment], error)
	Update(ctx context.Context, a *entity.Assessment) error
	Delete(ctx context.Context, id string) error
}

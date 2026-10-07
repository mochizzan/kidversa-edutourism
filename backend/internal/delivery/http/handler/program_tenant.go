package handler

import (
	"context"
	"errors"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// loadProgramAndCheckTenant resolves the parent program and enforces tenant
// isolation on every stage/substage/content write path (Tahap 1 step 3).
// Missing program surfaces as 404 not_found (via the repository); a program
// owned by another tenant surfaces as 403 forbidden. An empty caller keeps
// the legacy tenant-less path (mirrors the Update/Delete guards).
func loadProgramAndCheckTenant(ctx context.Context, repo repository.ProgramRepository, programID, caller string) (*entity.Program, error) {
	p, err := repo.GetProgramByID(ctx, programID)
	if err != nil {
		return nil, err
	}
	if caller != "" && derefTenant(p.TenantID) != caller {
		return nil, apperrors.Forbidden("forbidden", errors.New("program belongs to another tenant"))
	}
	return p, nil
}

// resolveStageProgram resolves a Topik to its parent program and enforces
// tenant isolation (read and write paths share it).
func resolveStageProgram(ctx context.Context, repo repository.ProgramRepository, stageID, caller string) (*entity.ProgramStage, *entity.Program, error) {
	s, err := repo.GetStageByID(ctx, stageID)
	if err != nil {
		return nil, nil, err
	}
	p, err := loadProgramAndCheckTenant(ctx, repo, s.ProgramID, caller)
	if err != nil {
		return nil, nil, err
	}
	return s, p, nil
}

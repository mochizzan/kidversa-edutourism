package reports

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// NarrativeGenerator produces a full AI narrative for a report.
type NarrativeGenerator interface {
	Generate(ctx context.Context, reportID string) (string, error)
	StreamGenerate(ctx context.Context, reportID string, onDelta func(string) error) (string, error)
}

// Usecase implements report business logic: anti-IDOR parent tokens + narrative.
type Usecase struct {
	repo repository.ReportRepository
	gen  NarrativeGenerator
}

// NewUsecase builds the reports usecase.
func NewUsecase(repo repository.ReportRepository, gen NarrativeGenerator) *Usecase {
	return &Usecase{repo: repo, gen: gen}
}

// Repo exposes the report repository (used by handlers for token lookups).
func (u *Usecase) Repo() repository.ReportRepository { return u.repo }

// generateToken returns a cryptographically random 64-char hex string.
func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// Approve marks a report approved and persists the approver.
func (u *Usecase) Approve(ctx context.Context, reportID, tenantID, approvedBy string, narrativeFinal string, missionIDs []string) (*entity.Report, error) {
	r, err := u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return nil, err
	}
	r.Status = entity.ReportApproved
	r.ApprovedBy = &approvedBy
	if narrativeFinal != "" {
		r.AINarrativeFinal = narrativeFinal
	}
	if missionIDs != nil {
		r.MissionIDs = missionIDs
	}
	now := time.Now().UTC()
	r.GeneratedAt = &now
	if err := u.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

// Send generates a fresh unguessable parent access token (anti-IDOR) and marks
// the report sent. The token is unguessable (32 random bytes → 64 hex chars),
// scoped to exactly one report, and expires after ttlHours.
func (u *Usecase) Send(ctx context.Context, reportID, tenantID string, ttlHours int) (*entity.Report, error) {
	r, err := u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return nil, err
	}
	tok, err := generateToken()
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	r.ParentAccessToken = tok
	r.ParentTokenRevoked = false
	exp := time.Now().UTC().Add(time.Duration(ttlHours) * time.Hour)
	r.ParentTokenExpiresAt = &exp
	r.Status = entity.ReportSent
	now := time.Now().UTC()
	r.SentAt = &now
	if err := u.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

// RevokeToken invalidates a report's parent access token.
func (u *Usecase) RevokeToken(ctx context.Context, reportID, tenantID string) (*entity.Report, error) {
	r, err := u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return nil, err
	}
	r.ParentTokenRevoked = true
	if err := u.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

// GenerateNarrative produces an AI narrative for a single report.
// If the report already has a draft narrative, it is skipped and returned as-is.
func (u *Usecase) GenerateNarrative(ctx context.Context, reportID, tenantID string) (*entity.Report, error) {
	r, err := u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return nil, err
	}
	if r.AINarrativeDraft != "" {
		return r, nil
	}
	text, err := u.gen.Generate(ctx, reportID)
	if err != nil {
		return nil, err
	}
	r.AINarrativeDraft = text
	if err := u.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

// StreamNarrative produces an AI narrative for a single report, streaming
// token deltas via onDelta. If the report already has a draft narrative and
// force is false, the existing draft is returned without regeneration.
// On success the draft is persisted; on error/partial generation nothing is
// persisted. force=true overwrites any existing draft.
func (u *Usecase) StreamNarrative(ctx context.Context, reportID, tenantID string, force bool, onDelta func(string) error) (string, error) {
	r, err := u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return "", err
	}
	if !force && r.AINarrativeDraft != "" {
		return r.AINarrativeDraft, nil
	}
	text, err := u.gen.StreamGenerate(ctx, reportID, onDelta)
	if err != nil {
		return "", err
	}
	r.AINarrativeDraft = text
	if err := u.repo.Update(ctx, r); err != nil {
		return "", err
	}
	return text, nil
}

// maxSessionReports is the upper bound for listing reports in a single
// session during batch generation. A session with more participants than
// this would require paginated processing.
const maxSessionReports = 1000

// GenerateForSession creates a DRAFT report for each participant that does not
// already have one, then runs the narrative generator for all reports in the
// session concurrently. Returns the full list of reports after generation.
func (u *Usecase) GenerateForSession(ctx context.Context, sessionID string, participants []entity.Participant) ([]entity.Report, error) {
	existing, err := u.repo.List(ctx, repository.ReportFilter{SessionID: sessionID}, 1, maxSessionReports)
	if err != nil {
		return nil, err
	}

	existingByParticipant := make(map[string]bool, len(existing.Items))
	for _, r := range existing.Items {
		existingByParticipant[r.ParticipantID] = true
	}

	for _, p := range participants {
		if existingByParticipant[p.ID] {
			continue
		}
		rep := &entity.Report{
			ParticipantID: p.ID,
			SessionID:     sessionID,
			Status:        entity.ReportDraft,
		}
		if err := u.repo.Create(ctx, rep); err != nil {
			return nil, err
		}
	}

	all, err := u.repo.List(ctx, repository.ReportFilter{SessionID: sessionID}, 1, maxSessionReports)
	if err != nil {
		return nil, err
	}

	const maxConcurrent = 3
	sem := make(chan struct{}, maxConcurrent)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var errs []error

	for _, r := range all.Items {
		if r.AINarrativeDraft != "" {
			continue
		}
		wg.Add(1)
		go func(report entity.Report) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			genCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
			defer cancel()

			text, err := u.gen.Generate(genCtx, report.ID)
			if err != nil {
				mu.Lock()
				errs = append(errs, fmt.Errorf("report %s: %w", report.ID, err))
				mu.Unlock()
				return
			}
			report.AINarrativeDraft = text
			if err := u.repo.Update(genCtx, &report); err != nil {
				mu.Lock()
				errs = append(errs, fmt.Errorf("update report %s: %w", report.ID, err))
				mu.Unlock()
			}
		}(r)
	}
	wg.Wait()

	if len(errs) > 0 {
		return nil, apperrors.Internal("narrative_generation_failed",
			fmt.Errorf("%d dari %d laporan gagal dibuatkan narasi: %v", len(errs), len(all.Items), errors.Join(errs...)))
	}

	all, err = u.repo.List(ctx, repository.ReportFilter{SessionID: sessionID}, 1, maxSessionReports)
	if err != nil {
		return nil, err
	}

	return all.Items, nil
}

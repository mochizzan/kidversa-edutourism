package reports

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/pkg/sse"
)

// NarrativeGenerator streams an AI narrative for a report in chunks.
// Implementations call onChunk with each progressive piece of text.
type NarrativeGenerator interface {
	Generate(ctx context.Context, reportID string, onChunk func(seq int, chunk string)) error
}

// Usecase implements report business logic: anti-IDOR parent tokens + narrative.
type Usecase struct {
	repo repository.ReportRepository
	hub  *sse.Hub
	gen  NarrativeGenerator
}

// NewUsecase builds the reports usecase.
func NewUsecase(repo repository.ReportRepository, hub *sse.Hub, gen NarrativeGenerator) *Usecase {
	return &Usecase{repo: repo, hub: hub, gen: gen}
}

// Repo exposes the report repository (used by handlers for token lookups).
func (u *Usecase) Repo() repository.ReportRepository { return u.repo }

// Hub exposes the SSE hub (used by the narrative-stream handler).
func (u *Usecase) Hub() *sse.Hub { return u.hub }

// generateToken returns a cryptographically random 64-char hex string.
func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// Approve marks a report approved and persists the approver.
func (u *Usecase) Approve(ctx context.Context, reportID, approvedBy string, narrativeFinal string, missionIDs []string) (*entity.Report, error) {
	r, err := u.repo.GetByID(ctx, reportID, "")
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
func (u *Usecase) Send(ctx context.Context, reportID string, ttlHours int) (*entity.Report, error) {
	r, err := u.repo.GetByID(ctx, reportID, "")
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
func (u *Usecase) RevokeToken(ctx context.Context, reportID string) (*entity.Report, error) {
	r, err := u.repo.GetByID(ctx, reportID, "")
	if err != nil {
		return nil, err
	}
	r.ParentTokenRevoked = true
	if err := u.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

// StreamNarrative runs the narrative generator and publishes each chunk to the
// report's SSE channel so connected parents receive progressive text.
func (u *Usecase) StreamNarrative(ctx context.Context, reportID string) error {
	r, err := u.repo.GetByID(ctx, reportID, "")
	if err != nil {
		return err
	}
	var accumulated string
	err = u.gen.Generate(ctx, reportID, func(seq int, chunk string) {
		accumulated += chunk
		if err := u.hub.Publish(ctx, sse.NarrativeChannel(reportID), sse.Event{
			Type: "narrative.chunk",
			Data: map[string]any{"seq": seq, "text": chunk},
		}); err != nil {
			log.Printf("reports: narrative SSE publish failed for report %s: %v", reportID, err)
		}
	})
	if err != nil {
		return err
	}
	r.AINarrativeDraft = accumulated
	return u.repo.Update(ctx, r)
}

// maxSessionReports is the upper bound for listing reports in a single
// session during batch generation. A session with more participants than
// this would require paginated processing.
const maxSessionReports = 1000

// GenerateForSession creates a DRAFT report for each participant that does not
// already have one, then runs the narrative generator for all reports in the
// session. Returns the full list of reports after generation.
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

	for _, r := range all.Items {
		_ = u.StreamNarrative(ctx, r.ID)
	}

	return all.Items, nil
}

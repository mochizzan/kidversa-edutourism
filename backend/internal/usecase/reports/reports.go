package reports

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/ai"
	"kidversa-edutourism-backend/internal/pkg/constants"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/pkg/util"
)

// NarrativeGenerator produces a full AI narrative for a report. tenantID is the
// resolved request scope (set by TenantScope) and is forwarded to the repository
// so tenant-scoped lookups work for SUPER_ADMIN (whose JWT carries an empty tid).
type NarrativeGenerator interface {
	Generate(ctx context.Context, reportID, tenantID string) (string, error)
	StreamGenerate(ctx context.Context, reportID, tenantID string, onDelta func(string) error) (string, error)
}

// MissionLLMClient is the minimal LLM surface the mission recommender needs.
// Satisfied by *ai.OpenRouterClient. Declared here so the reports package does
// not import the ai package (keeps the dependency boundary clean).
type MissionLLMClient interface {
	ChatCompletion(ctx context.Context, systemPrompt, userPrompt string) (string, error)
}

// MaxReportMissions caps the number of recommended/selected missions per report.
const MaxReportMissions = 4

// Usecase implements report business logic: anti-IDOR parent tokens + narrative
// + AI mission recommendation.
type Usecase struct {
	repo                   repository.ReportRepository
	gen                    NarrativeGenerator
	aiClient               MissionLLMClient
	missionRepo            repository.MissionBankRepository
	assessmentRepo         repository.AssessmentRepository
	sessionRepo            repository.SessionRepository
	programRepo            repository.ProgramRepository
	participantMissionRepo repository.ParticipantMissionRepository
	programSubstageRepo    repository.ProgramSubstageRepository
	sessionSubstageRepo    repository.SessionSubstageRepository
}

// NewUsecase builds the reports usecase.
func NewUsecase(
	repo repository.ReportRepository,
	gen NarrativeGenerator,
	aiClient MissionLLMClient,
	missionRepo repository.MissionBankRepository,
	assessmentRepo repository.AssessmentRepository,
	sessionRepo repository.SessionRepository,
	programRepo repository.ProgramRepository,
	participantMissionRepo repository.ParticipantMissionRepository,
	programSubstageRepo repository.ProgramSubstageRepository,
	sessionSubstageRepo repository.SessionSubstageRepository,
) *Usecase {
	return &Usecase{
		repo:                   repo,
		gen:                    gen,
		aiClient:               aiClient,
		missionRepo:            missionRepo,
		assessmentRepo:         assessmentRepo,
		sessionRepo:            sessionRepo,
		programRepo:            programRepo,
		participantMissionRepo: participantMissionRepo,
		programSubstageRepo:    programSubstageRepo,
		sessionSubstageRepo:    sessionSubstageRepo,
	}
}

// Repo exposes the report repository (used by handlers for token lookups).
func (u *Usecase) Repo() repository.ReportRepository { return u.repo }

// Approve marks a report approved and persists the approver.
func (u *Usecase) Approve(ctx context.Context, reportID, tenantID, approvedBy string, narrativeFinal string, missionIDs []string) (*entity.Report, error) {
	r, err := u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return nil, err
	}
	// Group completion gate: reject approval if the participant's group is not COMPLETED.
	if participant, perr := u.sessionRepo.GetParticipantByID(ctx, r.ParticipantID, tenantID); perr == nil && participant.GroupID != nil && *participant.GroupID != "" {
		if group, gerr := u.sessionRepo.GetSessionGroupByID(ctx, *participant.GroupID, tenantID); gerr == nil && group.Status != entity.GroupCompleted {
			return nil, apperrors.BadRequest("group_not_completed", nil)
		}
	}
	r.Status = entity.ReportApproved
	// Empty approver (e.g. when the client doesn't supply one) must be stored as
	// NULL, never as an empty string — fk_reports_approved_by references
	// users(id), so "" would violate the FK.
	if approvedBy != "" {
		r.ApprovedBy = &approvedBy
	} else {
		r.ApprovedBy = nil
	}
	if narrativeFinal != "" {
		r.AINarrativeFinal = narrativeFinal
	}
	if missionIDs != nil {
		// Cap persisted missions at MaxReportMissions (defense-in-depth even if a
		// client sends more); the UI also enforces the limit.
		if len(missionIDs) > MaxReportMissions {
			missionIDs = missionIDs[:MaxReportMissions]
		}
		r.MissionIDs = missionIDs
	}
	now := time.Now().UTC()
	r.GeneratedAt = &now
	if err := u.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	// Persist the approved mission selections into participant_missions (the
	// single source of truth; r.MissionIDs is read-derived from that join).
	// Without this, the mission ids were previously discarded (a no-op).
	if missionIDs != nil {
		if err := u.participantMissionRepo.ReplaceByReport(ctx, tenantID, reportID, buildItems(reportID, missionIDs)); err != nil {
			return nil, err
		}
	}
	// loadMissionIDs runs only on List/GetByID read paths, so re-fetch to
	// hydrate r.MissionIDs from the freshly written rows before responding.
	r, err = u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return nil, err
	}
	return r, nil
}

// SaveMissions persists the selected mission IDs for a report without changing
// the report status. This allows auto-saving mission selections while the admin
// is still reviewing (separate from Approve which also sets status + narrative).
func (u *Usecase) SaveMissions(ctx context.Context, reportID, tenantID string, missionIDs []string) (*entity.Report, error) {
	r, err := u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return nil, err
	}
	// Cap at MaxReportMissions (defense-in-depth).
	if len(missionIDs) > MaxReportMissions {
		missionIDs = missionIDs[:MaxReportMissions]
	}
	if err := u.participantMissionRepo.ReplaceByReport(ctx, tenantID, reportID, buildItems(reportID, missionIDs)); err != nil {
		return nil, err
	}
	// Re-fetch to hydrate r.MissionIDs from the freshly written rows.
	r, err = u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return nil, err
	}
	return r, nil
}

// buildItems constructs participant-mission rows for a report from mission ids.
func buildItems(reportID string, missionIDs []string) []entity.ParticipantMission {
	items := make([]entity.ParticipantMission, 0, len(missionIDs))
	for _, mid := range missionIDs {
		items = append(items, entity.ParticipantMission{
			ReportID:      reportID,
			MissionBankID: mid,
			IsCompleted:   true,
		})
	}
	return items
}

// Send generates a fresh unguessable parent access token (anti-IDOR) and marks
// the report sent. The token is unguessable (32 random bytes → 64 hex chars),
// scoped to exactly one report, and expires after ttlHours.
func (u *Usecase) Send(ctx context.Context, reportID, tenantID string, ttlHours int) (*entity.Report, error) {
	r, err := u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return nil, err
	}
	tok, err := util.RandomToken()
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
	text, err := u.gen.Generate(ctx, reportID, tenantID)
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
	text, err := u.gen.StreamGenerate(ctx, reportID, tenantID, onDelta)
	if err != nil {
		return "", err
	}
	r.AINarrativeDraft = text
	if err := u.repo.Update(ctx, r); err != nil {
		return "", err
	}
	return text, nil
}

// GenerateForSession creates a DRAFT report for each (participant, topic)
// pair that does not already have one, then runs the narrative generator for
// every report in the session concurrently. topicIDs is the set of
// program_stage_ids instantiated by the session (resolved by the caller via
// sessionRepo.ListSessionStages). Passing an empty topicIDs creates only the
// legacy whole-session report (program_stage_id = "") for backward
// compatibility. Returns the full list of reports after generation.
func (u *Usecase) GenerateForSession(ctx context.Context, sessionID, tenantID string, participants []entity.Participant, topicIDs []string) ([]entity.Report, error) {
	targetIDs := make(map[string]bool, len(participants))
	for _, p := range participants {
		targetIDs[p.ID] = true
	}
	if _, err := u.repo.List(ctx, repository.ReportFilter{SessionID: sessionID}, 1, constants.MaxSessionReports); err != nil {
		return nil, err
	}

	// Atomic per (participant, topic) via GetOrCreateDraft; soft-delete invariant
	// documented in report_repo.go. Legacy rows (empty topicID) and per-Topic rows
	// coexist under uq_reports_session_participant_topic.
	for _, p := range participants {
		for _, tid := range topicIDs {
			if _, err := u.repo.GetOrCreateDraft(ctx, p.ID, sessionID, tid); err != nil {
				return nil, err
			}
		}
	}

	all, err := u.repo.List(ctx, repository.ReportFilter{SessionID: sessionID}, 1, constants.MaxSessionReports)
	if err != nil {
		return nil, err
	}

	sem := make(chan struct{}, constants.ReportNarrativeConcurrency)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var errs []error

	for _, r := range all.Items {
		if r.AINarrativeDraft != "" {
			continue
		}
		if !targetIDs[r.ParticipantID] {
			continue
		}
		wg.Add(1)
		go func(report entity.Report) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			genCtx, cancel := context.WithTimeout(ctx, ai.OpenRouterRequestTimeout)
			defer cancel()

			text, err := u.gen.Generate(genCtx, report.ID, tenantID)
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

	all, err = u.repo.List(ctx, repository.ReportFilter{SessionID: sessionID}, 1, constants.MaxSessionReports)
	if err != nil {
		return nil, err
	}

	return all.Items, nil
}

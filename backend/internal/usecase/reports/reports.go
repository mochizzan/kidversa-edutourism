package reports

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/ai"
	"kidversa-edutourism-backend/internal/pkg/constants"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/pkg/phoneutil"
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
// + AI mission recommendation + gallery token generation.
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
	galleryRepo            repository.GalleryTokenRepository
	// messaging delivers the report link to the parent's WhatsApp on Send.
	messaging repository.MessagingService
	// userRepo resolves facilitator names for the public parent payload
	// (fallback when the read-time join in GetByToken came back empty).
	userRepo repository.UserRepository
	cfg      *config.Config
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
	galleryRepo repository.GalleryTokenRepository,
	cfg *config.Config,
	messaging repository.MessagingService,
	userRepo repository.UserRepository,
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
		galleryRepo:            galleryRepo,
		messaging:              messaging,
		userRepo:               userRepo,
		cfg:                    cfg,
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
	// Generate gallery token for QR code (best-effort — don't fail approval).
	tok, gerr := util.RandomToken()
	if gerr == nil {
		gt := &entity.GalleryToken{
			ReportID:      r.ID,
			ParticipantID: r.ParticipantID,
			SessionID:     r.SessionID,
			TenantID:      tenantID,
			Token:         tok,
			ExpiresAt:     time.Now().UTC().Add(u.cfg.GalleryTokenTTL),
		}
		_ = u.galleryRepo.Create(ctx, gt)
		r.GalleryAccessToken = tok
		r.GalleryTokenExpiresAt = &gt.ExpiresAt
		_ = u.repo.Update(ctx, r)
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

// Send generates a fresh unguessable parent access token (anti-IDOR), delivers
// the report link to the parent's WhatsApp, and only then marks the report
// SENT. The token is unguessable (32 random bytes → 64 hex chars), scoped to
// exactly one report, and expires after ttlHours.
//
// Failure handling: a failed delivery is recorded as SEND_FAILED (retryable
// via the same call) and reported to the caller — the report is never marked
// SENT before the gateway confirms the message was accepted.
func (u *Usecase) Send(ctx context.Context, reportID, tenantID string, ttlHours int) (*entity.Report, error) {
	r, err := u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return nil, err
	}
	participant, err := u.sessionRepo.GetParticipantByID(ctx, r.ParticipantID, tenantID)
	if err != nil {
		return nil, err
	}
	if u.cfg.ParentReportBaseURL == "" {
		log.Printf("reports: PARENT_REPORT_BASE_URL is not set; cannot deliver report %s", r.ID)
		return nil, u.markSendFailed(ctx, r, apperrors.Internal("report_link_not_configured", nil))
	}
	digits, derr := phoneutil.WhatsAppDigits(participant.ParentPhone)
	if derr != nil {
		return nil, u.markSendFailed(ctx, r, apperrors.BadRequest("whatsapp_number_missing", derr))
	}
	tok, err := util.RandomToken()
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	r.ParentAccessToken = tok
	r.ParentTokenRevoked = false
	exp := time.Now().UTC().Add(time.Duration(ttlHours) * time.Hour)
	r.ParentTokenExpiresAt = &exp
	// Persist the token before delivery so the shared link is already durable.
	if err := u.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	link := u.cfg.ParentReportBaseURL + "?token=" + tok
	msg := buildReportMessage(participant.ParentName, participant.ChildName, u.sessionName(ctx, r, tenantID), link)
	if serr := u.messaging.SendTextMessage(ctx, digits+"@c.us", msg); serr != nil {
		log.Printf("reports: whatsapp delivery failed for report %s: %v", r.ID, serr)
		return nil, u.markSendFailed(ctx, r, apperrors.New(http.StatusBadGateway, "whatsapp_send_failed", serr))
	}
	r.Status = entity.ReportSent
	now := time.Now().UTC()
	r.SentAt = &now
	if err := u.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

// markSendFailed records a retryable delivery failure and returns the error
// unchanged so handlers surface the original cause.
func (u *Usecase) markSendFailed(ctx context.Context, r *entity.Report, cause error) error {
	r.Status = entity.ReportSendFailed
	if err := u.repo.Update(ctx, r); err != nil {
		log.Printf("reports: could not record SEND_FAILED for report %s: %v", r.ID, err)
	}
	return cause
}

// sessionName resolves the session label used in the delivery message
// (best-effort: a lookup failure must not block the send).
func (u *Usecase) sessionName(ctx context.Context, r *entity.Report, tenantID string) string {
	s, err := u.sessionRepo.GetSessionByID(ctx, r.SessionID, tenantID)
	if err != nil || s == nil {
		return ""
	}
	return s.Name
}

// buildReportMessage composes the WhatsApp text carrying the parent link.
func buildReportMessage(parentName, childName, sessionName, link string) string {
	return fmt.Sprintf(`Kidversa Edutourism 🎓

Halo Bapak/Ibu %s,

Rapor %s sudah selesai dan telah disetujui.

Silakan lihat rapor melalui tautan berikut:
%s

Terima kasih 🙏`, parentName, childName, link)
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

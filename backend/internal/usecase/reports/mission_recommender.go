package reports

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"text/template"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

//go:embed prompts/report-missions-system.md prompts/report-missions-user.md
var missionPromptFS embed.FS

// SuggestMissions returns up to MaxReportMissions mission IDs recommended for the
// given report, scoped strictly to the report's Topic (program_stage). It loads
// the Topic's active missions (via mission_bank_stages) and the participant's
// Topic-scoped assessments, asks the LLM to pick the most relevant missions,
// validates the returned IDs against the candidate set, and trims to the cap.
// On any AI failure it falls back to a deterministic heuristic over the same
// candidates so the button always yields a sensible pick.
func (u *Usecase) SuggestMissions(ctx context.Context, reportID, tenantID string) ([]string, error) {
	r, err := u.repo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return nil, err
	}
	if r.ProgramStageID == "" {
		// Legacy whole-session report: per-Topic mission selection requires a Topic.
		return nil, apperrors.BadRequest("topic_required", fmt.Errorf("report %s is not scoped to a topic", reportID))
	}

	session, err := u.sessionRepo.GetSessionByID(ctx, r.SessionID, "")
	if err != nil {
		return nil, fmt.Errorf("fetch session: %w", err)
	}

	// Candidate pool: active missions linked (via mission_bank_stages) to THIS Topic.
	candidates, err := u.missionRepo.List(ctx, repository.MissionBankFilter{
		TenantID:  tenantID,
		ProgramID: session.ProgramID,
		TopicID:   r.ProgramStageID,
		IsActive:  boolPtr(true),
	}, 1, 1000)
	if err != nil {
		return nil, fmt.Errorf("list candidate missions: %w", err)
	}
	if len(candidates.Items) == 0 {
		return []string{}, nil
	}

	// Participant's Topic-scoped assessments.
	assessments, err := u.assessmentRepo.List(ctx, repository.AssessmentFilter{
		ParticipantID:  r.ParticipantID,
		SessionID:      r.SessionID,
		ProgramStageID: r.ProgramStageID,
		TenantID:       tenantID,
	}, 1, 100)
	if err != nil {
		return nil, fmt.Errorf("fetch assessments: %w", err)
	}

	// Try the LLM; fall back to the heuristic on any failure or empty result.
	picked, lerr := u.suggestViaLLM(ctx, r, session, candidates.Items, assessments.Items)
	if lerr != nil || len(picked) == 0 {
		return u.suggestHeuristic(candidates.Items, assessments.Items), nil
	}
	return picked, nil
}

// resolveKegiatanNames maps session Kegiatan IDs → their human-readable Kegiatan
// names. Returns an empty (non-nil) map on any repo failure — callers treat
// empty names as "Kegiatan tanpa nama" instead of erroring.
func (u *Usecase) resolveKegiatanNames(ctx context.Context, r *entity.Report, sessionID string) map[string]string {
	out := make(map[string]string)
	if u.programSubstageRepo == nil || u.sessionSubstageRepo == nil {
		return out
	}
	programSubstages, err := u.programSubstageRepo.ListSubstages(ctx, r.ProgramStageID)
	if err != nil {
		return out
	}
	nameByProgramSubstageID := make(map[string]string, len(programSubstages))
	for _, ps := range programSubstages {
		nameByProgramSubstageID[ps.ID] = ps.Name
	}
	sessionSubstages, err := u.sessionSubstageRepo.ListSessionSubstages(ctx, sessionID)
	if err != nil {
		return out
	}
	for _, sub := range sessionSubstages {
		if name, ok := nameByProgramSubstageID[sub.ProgramSubstageID]; ok && name != "" {
			out[sub.ID] = name
		}
	}
	return out
}

// BuildAssessmentLines renders assessment rows for the LLM prompt.
// Format: "Kegiatan <nama>: <N> bintang — "<komentar>""
// Drops uninformative rows (no signal). Stable input order. Missing names
// become "Kegiatan tanpa nama" (never UUIDs).
func BuildAssessmentLines(assessments []entity.Assessment, nameBySessionSubstageID map[string]string) []string {
	const defaultLabel = "Kegiatan tanpa nama"
	lines := make([]string, 0, len(assessments))
	for _, a := range assessments {
		if a.StarRating == 0 && a.Comment == "" {
			continue
		}
		name := defaultLabel
		if n, ok := nameBySessionSubstageID[a.SessionSubstageID]; ok && n != "" {
			name = n
		}
		line := fmt.Sprintf("Kegiatan %s: %d bintang", name, a.StarRating)
		if a.Comment != "" {
			line += fmt.Sprintf(" — %q", a.Comment)
		}
		lines = append(lines, line)
	}
	return lines
}

// suggestViaLLM asks the model to return up to MaxReportMissions mission IDs.
func (u *Usecase) suggestViaLLM(ctx context.Context, r *entity.Report, session *entity.Session, candidates []entity.MissionBank, assessments []entity.Assessment) ([]string, error) {
	if u.aiClient == nil {
		return nil, fmt.Errorf("ai client not configured")
	}
	participant, err := u.sessionRepo.GetParticipantByID(ctx, r.ParticipantID, "")
	if err != nil {
		return nil, err
	}
	topic, err := u.programRepo.GetStageByID(ctx, r.ProgramStageID)
	if err != nil {
		return nil, err
	}

	systemPrompt, err := missionPromptFS.ReadFile("prompts/report-missions-system.md")
	if err != nil {
		return nil, fmt.Errorf("read system prompt: %w", err)
	}
	userTmpl, err := missionPromptFS.ReadFile("prompts/report-missions-user.md")
	if err != nil {
		return nil, fmt.Errorf("read user prompt: %w", err)
	}
	tmpl, err := template.New("missions").Parse(string(userTmpl))
	if err != nil {
		return nil, fmt.Errorf("parse user prompt: %w", err)
	}

	candByID := make(map[string]entity.MissionBank, len(candidates))
	candLines := make([]string, 0, len(candidates))
	for _, c := range candidates {
		candByID[c.ID] = c
		candLines = append(candLines, fmt.Sprintf("- id: %s | misi: %q (Topik: %q)", c.ID, c.Title, topic.Name))
	}
	kegiatanNames := u.resolveKegiatanNames(ctx, r, session.ID)
	assessLines := BuildAssessmentLines(assessments, kegiatanNames)
	assessText := "(tidak ada data asesmen)"
	if len(assessLines) > 0 {
		assessText = strings.Join(assessLines, "\n")
	}

	var sb strings.Builder
	if err := tmpl.Execute(&sb, map[string]interface{}{
		"ChildName":   participant.ChildName,
		"TopicName":   topic.Name,
		"SessionName": session.Name,
		"MaxMissions": MaxReportMissions,
		"Candidates":  strings.Join(candLines, "\n"),
		"Assessments": assessText,
	}); err != nil {
		return nil, fmt.Errorf("execute user prompt: %w", err)
	}

	// Bound the LLM call so a stalled upstream (e.g. OpenRouter) fails fast and
	// we fall back to the deterministic heuristic instead of hanging the request.
	llmCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	raw, err := u.aiClient.ChatCompletion(llmCtx, string(systemPrompt), sb.String())
	if err != nil {
		return nil, err
	}
	return parseMissionIDs(raw, candByID)
}

// parseMissionIDs extracts mission IDs from the LLM response. The model is
// instructed to return JSON; we also tolerate plain comma/whitespace-separated
// IDs. Only IDs present in candByID are kept (anti-hallucination), and the
// result is trimmed to MaxReportMissions.
func parseMissionIDs(raw string, candByID map[string]entity.MissionBank) ([]string, error) {
	raw = strings.TrimSpace(raw)
	var ids []string
	if idx := strings.Index(raw, "["); idx >= 0 {
		end := strings.LastIndex(raw, "]")
		if end > idx {
			if err := json.Unmarshal([]byte(raw[idx:end+1]), &ids); err == nil {
				return filterAndTrim(ids, candByID), nil
			}
		}
	}
	for _, tok := range strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '\n' || r == ' ' || r == '"' || r == '[' || r == ']'
	}) {
		t := strings.TrimSpace(tok)
		if t != "" {
			ids = append(ids, t)
		}
	}
	return filterAndTrim(ids, candByID), nil
}

func filterAndTrim(ids []string, candByID map[string]entity.MissionBank) []string {
	seen := make(map[string]bool, len(ids))
	out := make([]string, 0, MaxReportMissions)
	for _, id := range ids {
		if _, ok := candByID[id]; !ok {
			continue // drop hallucinated / out-of-scope IDs
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
		if len(out) >= MaxReportMissions {
			break
		}
	}
	return out
}

// suggestHeuristic is the deterministic fallback when the LLM is unavailable.
// Returns up to MaxReportMissions IDs. Base order = curation order (input
// candidates already sorted by sort_order ASC, created_at DESC from the repo).
// Secondary scoring (+1) for missions whose title contains a weak Kegiatan
// name (case-insensitive substring of assessment comments with bintang ≤ 2).
// Returns always min(MaxReportMissions, len(candidates)).
func (u *Usecase) suggestHeuristic(candidates []entity.MissionBank, assessments []entity.Assessment) []string {
	// Collect weak assessment comments (bintang ≤ 2, non-empty) for secondary scoring.
	var weakComments []string
	for _, a := range assessments {
		if a.StarRating >= 1 && a.StarRating <= 2 && a.Comment != "" {
			weakComments = append(weakComments, a.Comment)
		}
	}

	type scored struct {
		id    string
		score int
	}
	items := make([]scored, 0, len(candidates))
	for _, c := range candidates {
		score := 0
		titleLower := strings.ToLower(c.Title)
		for _, wc := range weakComments {
			if strings.Contains(titleLower, strings.ToLower(wc)) {
				score++
			}
		}
		items = append(items, scored{id: c.ID, score: score})
	}
	// Stable sort by score DESC only — preserves input (curation) order as tie-break.
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].score > items[j].score
	})
	limit := MaxReportMissions
	if len(items) < limit {
		limit = len(items)
	}
	out := make([]string, 0, limit)
	for i := 0; i < limit; i++ {
		out = append(out, items[i].id)
	}
	return out
}

func boolPtr(b bool) *bool { return &b }

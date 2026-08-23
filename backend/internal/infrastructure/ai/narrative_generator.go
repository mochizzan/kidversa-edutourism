package ai

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"
	"sync"
	"text/template"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

//go:embed prompts/report-narrative-system.md prompts/report-narrative-user.md
var promptFS embed.FS

var systemPromptCached string
var systemPromptOnce sync.Once

// defaultStageLabel is the fallback label used when an assessment's Kegiatan
// cannot be resolved to a real name (orphaned Kegiatan, deleted Topik, or
// empty name). It must never be an internal ID — leaking UUIDs into the prompt
// makes the AI echo them back to the reader.
const defaultStageLabel = "Kegiatan"

// buildAssessmentText renders the assessment block fed to the narrative prompt.
// It maps each assessment (keyed by its session Kegiatan ID) to its parent
// Topik for a human-readable name and stable ordering, and drops
// uninformative rows (no rating and no comment). The mapping is built by the
// callers from sessionStages + sessionSubstages + programStages so no internal
// UUIDs leak.
func buildAssessmentText(assessments *repository.Paginated[entity.Assessment], stageBySubstageID map[string]entity.ProgramStage) string {
	type row struct {
		order int
		text  string
	}
	rows := make([]row, 0, len(assessments.Items))
	for i, a := range assessments.Items {
		order := i + 1
		name := defaultStageLabel
		if st, ok := stageBySubstageID[a.SessionSubstageID]; ok {
			if st.SequenceOrder > 0 {
				order = st.SequenceOrder
			}
			if st.Name != "" {
				name = st.Name
			}
		}
		// Skip rows that carry no signal for the narrative.
		if a.StarRating == 0 && a.Comment == "" {
			continue
		}
		text := fmt.Sprintf("Kegiatan %s: %d bintang", name, a.StarRating)
		if a.Comment != "" {
			text += fmt.Sprintf(" — %q", a.Comment)
		}
		rows = append(rows, row{order: order, text: text})
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].order < rows[j].order })

	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.text)
	}
	if len(out) == 0 {
		return "Tidak ada penilaian yang tercatat."
	}
	return strings.Join(out, "\n")
}

// buildStageBySubstageID resolves each session Kegiatan of a session
// to its parent Topik. Assessments are keyed by
// session Kegiatan ID, so this lets buildAssessmentText print the real
// Topik name instead of the "Kegiatan" fallback. Returns an empty (non-nil) map when
// the substage repo is unwired, preserving prior behaviour.
func (g *OpenRouterNarrativeGenerator) buildStageBySubstageID(ctx context.Context, sessionID, programID string) (map[string]entity.ProgramStage, error) {
	stageBySubstageID := make(map[string]entity.ProgramStage)
	if g.substageRepo == nil {
		return stageBySubstageID, nil
	}
	programStages, err := g.programRepo.ListStages(ctx, programID)
	if err != nil {
		return nil, fmt.Errorf("fetch program stages: %w", err)
	}
	stageByProgramID := make(map[string]entity.ProgramStage, len(programStages))
	for _, ps := range programStages {
		stageByProgramID[ps.ID] = ps
	}
	// sub.SessionStageID is a session Topik ID, so it must be bridged through
	// the session Topik to reach its program Topik row.
	sessionStages, err := g.sessionRepo.ListSessionStages(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("fetch session stages: %w", err)
	}
	stageBySessionStageID := make(map[string]entity.ProgramStage, len(sessionStages))
	for _, ss := range sessionStages {
		if ps, ok := stageByProgramID[ss.ProgramStageID]; ok {
			stageBySessionStageID[ss.ID] = ps
		}
	}
	subs, err := g.substageRepo.ListSessionSubstages(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("fetch session substages: %w", err)
	}
	for _, sub := range subs {
		if ps, ok := stageBySessionStageID[sub.SessionStageID]; ok {
			stageBySubstageID[sub.ID] = ps
		}
	}
	return stageBySubstageID, nil
}

// OpenRouterNarrativeGenerator implements reports.NarrativeGenerator using a
// chat-completions LLM client (OpenRouter or Gemini — both satisfy LLMClient).
type OpenRouterNarrativeGenerator struct {
	client         LLMClient
	reportRepo     repository.ReportRepository
	sessionRepo    repository.SessionRepository
	substageRepo   repository.SessionSubstageRepository
	assessmentRepo repository.AssessmentRepository
	programRepo    repository.ProgramRepository
}

// NewNarrativeGenerator builds a narrative generator backed by an LLMClient.
// Accepts any client implementing ai.LLMClient (OpenRouter or Gemini), so the
// active provider is selected via configuration rather than code.
func NewNarrativeGenerator(
	client LLMClient,
	reportRepo repository.ReportRepository,
	sessionRepo repository.SessionRepository,
	assessmentRepo repository.AssessmentRepository,
	programRepo repository.ProgramRepository,
	substageRepo repository.SessionSubstageRepository,
) *OpenRouterNarrativeGenerator {
	return &OpenRouterNarrativeGenerator{
		client:         client,
		reportRepo:     reportRepo,
		sessionRepo:    sessionRepo,
		substageRepo:   substageRepo,
		assessmentRepo: assessmentRepo,
		programRepo:    programRepo,
	}
}

// Generate produces a full AI narrative for the given report.
func (g *OpenRouterNarrativeGenerator) Generate(ctx context.Context, reportID, tenantID string) (string, error) {
	r, err := g.reportRepo.GetByID(ctx, reportID, tenantID)
	if err != nil {
		return "", err
	}

	participant, err := g.sessionRepo.GetParticipantByID(ctx, r.ParticipantID, "")
	if err != nil {
		return "", fmt.Errorf("fetch participant: %w", err)
	}

	session, err := g.sessionRepo.GetSessionByID(ctx, r.SessionID, "")
	if err != nil {
		return "", fmt.Errorf("fetch session: %w", err)
	}

	// Bridge session Kegiatan IDs -> their parent Topik so each
	// assessment (keyed by session Kegiatan ID) resolves to a real name + order
	// instead of the fallback "Kegiatan" label.
	stageBySubstageID, err := g.buildStageBySubstageID(ctx, r.SessionID, session.ProgramID)
	if err != nil {
		return "", err
	}

	// Per-Topic scoping: when the report is for a specific Topic
	// (program_stage), the assessment fetch is filtered to that Topic via the
	// repo join (AssessmentFilter.ProgramStageID) so the AI never sees other
	// Topics' data. The Topic name is resolved for a single-Topic narrative frame.
	topicName := ""
	var topicFilter string
	if r.ProgramStageID != "" {
		topic, terr := g.programRepo.GetStageByID(ctx, r.ProgramStageID)
		if terr != nil {
			return "", fmt.Errorf("fetch topic: %w", terr)
		}
		topicName = topic.Name
		topicFilter = r.ProgramStageID
	}

	assessments, err := g.assessmentRepo.List(ctx, repository.AssessmentFilter{
		ParticipantID:  participant.ID,
		SessionID:      r.SessionID,
		ProgramStageID: topicFilter,
		TenantID:       tenantID,
	}, 1, 100)
	if err != nil {
		return "", fmt.Errorf("fetch assessments: %w", err)
	}

	assessmentsText := buildAssessmentText(assessments, stageBySubstageID)

	tmplData := map[string]interface{}{
		"ChildName":   participant.ChildName,
		"ChildAge":    participant.ChildAge,
		"SessionName": session.Name,
		"SessionDate": session.SessionDate,
		"TopicName":   topicName,
		"Assessments": assessmentsText,
	}

	systemPrompt, err := g.loadSystemPrompt()
	if err != nil {
		return "", fmt.Errorf("load system prompt: %w", err)
	}

	userPrompt, err := g.buildUserPrompt(tmplData)
	if err != nil {
		return "", fmt.Errorf("build user prompt: %w", err)
	}

	text, err := g.client.ChatCompletion(ctx, systemPrompt, userPrompt)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(text), nil
}

// StreamGenerate produces a full AI narrative for the given report, invoking
// onDelta with the completed text. The configured free-tier model rejects
// streaming (HTTP 429), so this delegates to Generate (non-streaming) and
// delivers the full narrative in one shot: onDelta is invoked once with the
// complete text so any consumer expecting deltas still receives it, and the
// SSE "done" event carries the same text. This keeps the OpenRouter call
// footprint to a single request, which the free tier reliably serves.
func (g *OpenRouterNarrativeGenerator) StreamGenerate(ctx context.Context, reportID, tenantID string, onDelta func(string) error) (string, error) {
	text, err := g.Generate(ctx, reportID, tenantID)
	if err != nil {
		return "", err
	}
	if onDelta != nil {
		_ = onDelta(text)
	}
	return text, nil
}

func (g *OpenRouterNarrativeGenerator) loadSystemPrompt() (string, error) {
	systemPromptOnce.Do(func() {
		b, err := promptFS.ReadFile("prompts/report-narrative-system.md")
		if err != nil {
			systemPromptCached = ""
			return
		}
		systemPromptCached = string(b)
	})
	if systemPromptCached == "" {
		return "", fmt.Errorf("system prompt not embedded")
	}
	return systemPromptCached, nil
}

func (g *OpenRouterNarrativeGenerator) buildUserPrompt(data map[string]interface{}) (string, error) {
	raw, err := promptFS.ReadFile("prompts/report-narrative-user.md")
	if err != nil {
		return "", fmt.Errorf("read user prompt: %w", err)
	}
	tmpl, err := template.New("user").Parse(string(raw))
	if err != nil {
		return "", fmt.Errorf("parse user prompt: %w", err)
	}
	var sb strings.Builder
	if err := tmpl.Execute(&sb, data); err != nil {
		return "", fmt.Errorf("execute user prompt: %w", err)
	}
	return sb.String(), nil
}

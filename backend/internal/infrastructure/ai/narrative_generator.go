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

// defaultStageLabel is the fallback label used when an assessment's stage
// cannot be resolved to a real name (orphaned stage, deleted program stage, or
// empty name). It must never be an internal ID — leaking UUIDs into the prompt
// makes the AI echo them back to the reader.
const defaultStageLabel = "Tahap"

// buildAssessmentText renders the assessment block fed to the narrative prompt.
// It maps each assessment (keyed by its session-stage instance ID) to its
// program stage for a human-readable name and stable ordering, and drops
// uninformative rows (no rating and no comment). The mapping is built by the
// callers from sessionStages + programStages so no internal UUIDs leak.
func buildAssessmentText(assessments *repository.Paginated[entity.Assessment], stageBySessionID map[string]entity.ProgramStage) string {
	type row struct {
		order int
		text  string
	}
	rows := make([]row, 0, len(assessments.Items))
	for i, a := range assessments.Items {
		order := i + 1
		name := defaultStageLabel
		if st, ok := stageBySessionID[a.SessionStageID]; ok {
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
		text := fmt.Sprintf("Tahap %s: %d bintang", name, a.StarRating)
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

// OpenRouterNarrativeGenerator implements reports.NarrativeGenerator using
// the OpenRouter chat completions API.
type OpenRouterNarrativeGenerator struct {
	client         *OpenRouterClient
	reportRepo     repository.ReportRepository
	sessionRepo    repository.SessionRepository
	assessmentRepo repository.AssessmentRepository
	programRepo    repository.ProgramRepository
}

// NewOpenRouterNarrativeGenerator builds a narrative generator backed by OpenRouter.
func NewOpenRouterNarrativeGenerator(
	client *OpenRouterClient,
	reportRepo repository.ReportRepository,
	sessionRepo repository.SessionRepository,
	assessmentRepo repository.AssessmentRepository,
	programRepo repository.ProgramRepository,
) *OpenRouterNarrativeGenerator {
	return &OpenRouterNarrativeGenerator{
		client:         client,
		reportRepo:     reportRepo,
		sessionRepo:    sessionRepo,
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

	sessionStages, err := g.sessionRepo.ListSessionStages(ctx, r.SessionID)
	if err != nil {
		return "", fmt.Errorf("fetch session stages: %w", err)
	}

	programStages, err := g.programRepo.ListStages(ctx, session.ProgramID)
	if err != nil {
		return "", fmt.Errorf("fetch program stages: %w", err)
	}

	// Bridge session-stage instance IDs -> their program stage so assessments
	// (keyed by session-stage ID) resolve to a real name + order.
	stageByProgramID := make(map[string]entity.ProgramStage, len(programStages))
	for _, ps := range programStages {
		stageByProgramID[ps.ID] = ps
	}
	stageBySessionID := make(map[string]entity.ProgramStage, len(sessionStages))
	for _, ss := range sessionStages {
		if ps, ok := stageByProgramID[ss.ProgramStageID]; ok {
			stageBySessionID[ss.ID] = ps
		}
	}

	assessments, err := g.assessmentRepo.List(ctx, repository.AssessmentFilter{
		ParticipantID: participant.ID,
		SessionID:     r.SessionID,
	}, 1, 100)
	if err != nil {
		return "", fmt.Errorf("fetch assessments: %w", err)
	}

	assessmentsText := buildAssessmentText(assessments, stageBySessionID)

	tmplData := map[string]interface{}{
		"ChildName":   participant.ChildName,
		"ChildAge":    participant.ChildAge,
		"SessionName": session.Name,
		"SessionDate": session.SessionDate,
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
// onDelta for each streamed token delta.
func (g *OpenRouterNarrativeGenerator) StreamGenerate(ctx context.Context, reportID, tenantID string, onDelta func(string) error) (string, error) {
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

	sessionStages, err := g.sessionRepo.ListSessionStages(ctx, r.SessionID)
	if err != nil {
		return "", fmt.Errorf("fetch session stages: %w", err)
	}

	programStages, err := g.programRepo.ListStages(ctx, session.ProgramID)
	if err != nil {
		return "", fmt.Errorf("fetch program stages: %w", err)
	}

	// Bridge session-stage instance IDs -> their program stage so assessments
	// (keyed by session-stage ID) resolve to a real name + order.
	stageByProgramID := make(map[string]entity.ProgramStage, len(programStages))
	for _, ps := range programStages {
		stageByProgramID[ps.ID] = ps
	}
	stageBySessionID := make(map[string]entity.ProgramStage, len(sessionStages))
	for _, ss := range sessionStages {
		if ps, ok := stageByProgramID[ss.ProgramStageID]; ok {
			stageBySessionID[ss.ID] = ps
		}
	}

	assessments, err := g.assessmentRepo.List(ctx, repository.AssessmentFilter{
		ParticipantID: participant.ID,
		SessionID:     r.SessionID,
	}, 1, 100)
	if err != nil {
		return "", fmt.Errorf("fetch assessments: %w", err)
	}

	assessmentsText := buildAssessmentText(assessments, stageBySessionID)

	tmplData := map[string]interface{}{
		"ChildName":   participant.ChildName,
		"ChildAge":    participant.ChildAge,
		"SessionName": session.Name,
		"SessionDate": session.SessionDate,
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

	var full strings.Builder
	if err := g.client.StreamChatCompletion(ctx, systemPrompt, userPrompt, func(delta string) error {
		full.WriteString(delta)
		if onDelta != nil {
			return onDelta(delta)
		}
		return nil
	}); err != nil {
		return "", err
	}

	text := strings.TrimSpace(full.String())
	if text == "" {
		return "", fmt.Errorf("openrouter: empty response content")
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

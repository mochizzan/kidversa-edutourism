package ai

import (
	"context"
	"embed"
	"fmt"
	"strings"
	"sync"
	"text/template"

	"kidversa-edutourism-backend/internal/domain/repository"
)

//go:embed prompts/report-narrative-system.md prompts/report-narrative-user.md
var promptFS embed.FS

var systemPromptCached string
var systemPromptOnce sync.Once

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
func (g *OpenRouterNarrativeGenerator) Generate(ctx context.Context, reportID string) (string, error) {
	r, err := g.reportRepo.GetByID(ctx, reportID, "")
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

	stageIDs := make([]string, 0, len(sessionStages))
	for _, ss := range sessionStages {
		stageIDs = append(stageIDs, ss.ProgramStageID)
	}

	programStages, err := g.programRepo.ListStages(ctx, session.ProgramID)
	if err != nil {
		return "", fmt.Errorf("fetch program stages: %w", err)
	}

	stageNameMap := make(map[string]string, len(programStages))
	for _, ps := range programStages {
		stageNameMap[ps.ID] = ps.Name
	}

	assessments, err := g.assessmentRepo.List(ctx, repository.AssessmentFilter{
		ParticipantID: participant.ID,
		SessionID:     r.SessionID,
	}, 1, 100)
	if err != nil {
		return "", fmt.Errorf("fetch assessments: %w", err)
	}

	var assessmentLines []string
	for _, a := range assessments.Items {
		stageName := stageNameMap[a.SessionStageID]
		if stageName == "" {
			stageName = a.SessionStageID
		}
		line := fmt.Sprintf("Tahap %s: %d bintang", stageName, a.StarRating)
		if a.Comment != "" {
			line += fmt.Sprintf(" — \"%s\"", a.Comment)
		}
		assessmentLines = append(assessmentLines, line)
	}

	assessmentsText := strings.Join(assessmentLines, "\n")
	if assessmentsText == "" {
		assessmentsText = "Tidak ada penilaian yang tercatat."
	}

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

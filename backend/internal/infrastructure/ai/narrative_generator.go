package ai

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"text/template"
	"time"

	"kidversa-edutourism-backend/internal/domain/repository"
)

type promptCache struct {
	mu      sync.RWMutex
	content string
	modTime time.Time
}

var globalPromptCache promptCache

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

	tmpl, err := template.New("narrative").Parse(systemPrompt)
	if err != nil {
		return "", fmt.Errorf("parse system prompt: %w", err)
	}

	var sb strings.Builder
	if err := tmpl.Execute(&sb, tmplData); err != nil {
		return "", fmt.Errorf("execute system prompt template: %w", err)
	}
	resolvedSystemPrompt := sb.String()

	userPrompt := fmt.Sprintf("Anak: %s (Usia: %d tahun)\nSesi: %s\nTanggal: %s\n\nData penilaian:\n%s",
		participant.ChildName, participant.ChildAge, session.Name, session.SessionDate, assessmentsText)

	text, err := g.client.ChatCompletion(ctx, resolvedSystemPrompt, userPrompt)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(text), nil
}

func (g *OpenRouterNarrativeGenerator) loadSystemPrompt() (string, error) {
	promptPath := filepath.Join("backend", "internal", "infrastructure", "ai", "prompts", "report-narrative.md")

	info, err := os.Stat(promptPath)
	if err != nil {
		return "", err
	}

	globalPromptCache.mu.RLock()
	if globalPromptCache.content != "" && !info.ModTime().After(globalPromptCache.modTime) {
		cached := globalPromptCache.content
		globalPromptCache.mu.RUnlock()
		return cached, nil
	}
	globalPromptCache.mu.RUnlock()

	data, err := os.ReadFile(promptPath)
	if err != nil {
		return "", err
	}

	globalPromptCache.mu.Lock()
	globalPromptCache.content = string(data)
	globalPromptCache.modTime = info.ModTime()
	globalPromptCache.mu.Unlock()

	return globalPromptCache.content, nil
}

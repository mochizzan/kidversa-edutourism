package ai

import (
	"log"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// Provider identifiers selectable via the AI_PROVIDER env var.
const (
	ProviderOpenRouter = "openrouter"
	ProviderGemini     = "gemini"
)

// NewClient builds the LLM client for the configured provider. It returns the
// ai.LLMClient interface so callers stay provider-agnostic.
func NewClient(cfg *config.Config) LLMClient {
	switch cfg.AIProvider {
	case ProviderGemini:
		if cfg.GeminiAPIKey == "" {
			log.Printf("ai: AI_PROVIDER=gemini but GEMINI_API_KEY is empty; AI features will fail")
		}
		return NewGeminiClient(cfg)
	case ProviderOpenRouter:
		if cfg.OpenRouterAPIKey == "" {
			log.Printf("ai: AI_PROVIDER=openrouter but OPENROUTER_API_KEY is empty; AI features will fail")
		}
		return NewOpenRouterClient(cfg)
	default:
		log.Printf("ai: unknown AI_PROVIDER %q (valid: openrouter|gemini); defaulting to gemini", cfg.AIProvider)
		return NewGeminiClient(cfg)
	}
}

// NewNarrativeGeneratorForProvider builds a narrative generator bound to the
// configured provider's client.
func NewNarrativeGeneratorForProvider(
	cfg *config.Config,
	reportRepo repository.ReportRepository,
	sessionRepo repository.SessionRepository,
	assessmentRepo repository.AssessmentRepository,
	programRepo repository.ProgramRepository,
	substageRepo repository.SessionSubstageRepository,
) *OpenRouterNarrativeGenerator {
	client := NewClient(cfg)
	return NewNarrativeGenerator(client, reportRepo, sessionRepo, assessmentRepo, programRepo, substageRepo)
}

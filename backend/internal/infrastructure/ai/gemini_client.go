package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"kidversa-edutourism-backend/internal/config"
)

// LLMClient is the minimal chat-completion surface the narrative generator and
// mission recommender need. Both OpenRouterClient and GeminiClient implement it,
// so the provider can be swapped via configuration without touching callers.
type LLMClient interface {
	ChatCompletion(ctx context.Context, systemPrompt, userPrompt string) (string, error)
}

const geminiMaxBodySize = 64 * 1024

// geminiRequest is the Google AI Studio (Gemini) generateContent payload.
// systemInstruction is a top-level field; the conversation is a single user turn.
type geminiRequest struct {
	SystemInstruction *geminiContent  `json:"systemInstruction,omitempty"`
	Contents          []geminiContent `json:"contents"`
	GenerationConfig  geminiGenConfig `json:"generationConfig"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
	Role  string       `json:"role,omitempty"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiGenConfig struct {
	MaxOutputTokens int     `json:"maxOutputTokens"`
	Temperature     float64 `json:"temperature"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// GeminiClient calls the Google AI Studio (Gemini) generateContent API. It
// satisfies the same LLMClient interface as OpenRouterClient so the provider is
// selectable at runtime via AI_PROVIDER.
type GeminiClient struct {
	apiKey      string
	model       string
	baseURL     string
	client      *http.Client
	temperature float64
	maxTokens   int
	minInterval time.Duration // min spacing between consecutive Gemini calls
}

// geminiCallMu serializes Gemini calls process-wide so the throttle below
// enforces a global requests-per-minute ceiling (the free tier is ~4 RPM).
var (
	geminiCallMu   sync.Mutex
	geminiLastCall time.Time
)

// NewGeminiClient builds a Gemini HTTP client from configuration.
func NewGeminiClient(cfg *config.Config) *GeminiClient {
	return &GeminiClient{
		apiKey:      cfg.GeminiAPIKey,
		model:       cfg.GeminiModel,
		baseURL:     cfg.GeminiBaseURL,
		client:      &http.Client{Timeout: OpenRouterRequestTimeout},
		temperature: cfg.Temperature,
		maxTokens:   cfg.OpenRouterMaxTokens,
		minInterval: time.Duration(cfg.GeminiMinIntervalSec) * time.Second,
	}
}

// throttle ensures at least minInterval has elapsed since the previous Gemini
// call across the whole process. It blocks (honouring ctx cancellation) until
// the next permitted send time, then claims that slot. This keeps the free-tier
// RPM/TPS ceilings from tripping under the concurrent report-generation loop.
func (c *GeminiClient) throttle(ctx context.Context) {
	if c.minInterval <= 0 {
		return
	}
	geminiCallMu.Lock()
	defer geminiCallMu.Unlock()
	elapsed := time.Since(geminiLastCall)
	if elapsed < c.minInterval {
		wait := c.minInterval - elapsed
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
	geminiLastCall = time.Now()
}

// geminiRetryAttempts mirrors the OpenRouter client's resilience posture.
const geminiRetryAttempts = 5

// isTransientGeminiStatus reports whether a Gemini HTTP status (or embedded
// error code) is worth retrying: rate limits (429) and 5xx.
func isTransientGeminiStatus(code int, embeddedCode int) bool {
	switch code {
	case http.StatusTooManyRequests, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return true
	}
	switch embeddedCode {
	case 429, 500, 503, 504:
		return true
	}
	return false
}

// ChatCompletion sends a (system + user) chat completion and returns the model's text.
// Transient upstream failures (rate-limit / 5xx) are retried with backoff, and
// the request is rebuilt per attempt because http.Request bodies are single-use.
func (c *GeminiClient) ChatCompletion(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	// Enforce global spacing before issuing the (first) request so consecutive
	// Gemini calls respect the free-tier RPM ceiling.
	c.throttle(ctx)
	var lastErr error
	for attempt := 0; attempt < geminiRetryAttempts; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return "", lastErr
			case <-time.After(time.Duration(attempt) * 1500 * time.Millisecond):
			}
		}
		req, err := c.buildRequest(ctx, systemPrompt, userPrompt)
		if err != nil {
			return "", err
		}
		resp, err := c.client.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("gemini request failed: %w", err)
			continue
		}
		body, rerr := io.ReadAll(io.LimitReader(resp.Body, geminiMaxBodySize))
		resp.Body.Close()
		if rerr != nil {
			lastErr = fmt.Errorf("read gemini response: %w", rerr)
			continue
		}

		var gResp geminiResponse
		if err := json.Unmarshal(body, &gResp); err != nil {
			lastErr = fmt.Errorf("parse gemini response: %w", err)
			continue
		}
		if gResp.Error != nil {
			if isTransientGeminiStatus(resp.StatusCode, gResp.Error.Code) {
				lastErr = fmt.Errorf("gemini: transient status %d (%s)", gResp.Error.Code, gResp.Error.Message)
				continue
			}
			return "", fmt.Errorf("gemini: %s", gResp.Error.Message)
		}
		if resp.StatusCode != http.StatusOK {
			if isTransientGeminiStatus(resp.StatusCode, 0) {
				lastErr = fmt.Errorf("gemini: transient status %d", resp.StatusCode)
				continue
			}
			return "", fmt.Errorf("gemini: unexpected status %d", resp.StatusCode)
		}

		if len(gResp.Candidates) == 0 || len(gResp.Candidates[0].Content.Parts) == 0 {
			return "", fmt.Errorf("gemini: no candidates in response")
		}
		content := gResp.Candidates[0].Content.Parts[0].Text
		if content == "" {
			return "", fmt.Errorf("gemini: empty response content")
		}
		return content, nil
	}
	return "", lastErr
}

// buildRequest constructs a Gemini generateContent HTTP request.
func (c *GeminiClient) buildRequest(ctx context.Context, systemPrompt, userPrompt string) (*http.Request, error) {
	body := geminiRequest{
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{Text: systemPrompt}},
		},
		Contents: []geminiContent{
			{Role: "user", Parts: []geminiPart{{Text: userPrompt}}},
		},
		GenerationConfig: geminiGenConfig{
			MaxOutputTokens: c.maxTokens,
			Temperature:     c.temperature,
		},
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal gemini request: %w", err)
	}
	url := c.baseURL + "/models/" + c.model + ":generateContent?key=" + c.apiKey
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, fmt.Errorf("build gemini request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	return req, nil
}

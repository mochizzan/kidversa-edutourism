package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"kidversa-edutourism-backend/internal/config"
)

const openRouterMaxBodySize = 64 * 1024

// openRouterHTTPReferer is sent as the HTTP-Referer header on OpenRouter requests.
const openRouterHTTPReferer = "https://kidversa.id"

type openRouterRequest struct {
	Model       string              `json:"model"`
	Messages    []openRouterMessage `json:"messages"`
	Temperature float64             `json:"temperature"`
	MaxTokens   int                 `json:"max_tokens"`
	Stream      bool                `json:"stream"`
}

type openRouterStreamChunk struct {
	Choices []openRouterStreamChoice `json:"choices"`
}

type openRouterStreamChoice struct {
	Delta openRouterMessage `json:"delta"`
}

type openRouterMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openRouterResponse struct {
	Choices []openRouterChoice `json:"choices"`
}

type openRouterChoice struct {
	Message openRouterMessage `json:"message"`
}

// OpenRouterClient calls the OpenRouter chat completions API.
type OpenRouterClient struct {
	apiKey      string
	model       string
	baseURL     string
	client      *http.Client
	temperature float64
	maxTokens   int
}

// NewOpenRouterClient builds an OpenRouter HTTP client from configuration.
// Model parameters (temperature, max tokens) are sourced from cfg; missing
// values are defaulted by config.Load (temperature 0.7, max tokens 1024).
func NewOpenRouterClient(cfg *config.Config) *OpenRouterClient {
	return &OpenRouterClient{
		apiKey:  cfg.OpenRouterAPIKey,
		model:   cfg.OpenRouterModel,
		baseURL: cfg.OpenRouterBaseURL,
		client: &http.Client{
			Timeout: OpenRouterRequestTimeout,
		},
		temperature: cfg.Temperature,
		maxTokens:   cfg.OpenRouterMaxTokens,
	}
}

// ChatCompletion sends a chat completion request and returns the assistant's response text.
func (c *OpenRouterClient) ChatCompletion(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	req, err := c.buildRequest(ctx, systemPrompt, userPrompt, false)
	if err != nil {
		return "", err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("openrouter request failed: %w", err)
	}
	defer resp.Body.Close()

	if err := mapStatusError(resp.StatusCode); err != nil {
		return "", err
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, openRouterMaxBodySize))
	if err != nil {
		return "", fmt.Errorf("read response body: %w", err)
	}

	var orResp openRouterResponse
	if err := json.Unmarshal(data, &orResp); err != nil {
		return "", fmt.Errorf("parse openrouter response: %w", err)
	}

	if len(orResp.Choices) == 0 {
		return "", fmt.Errorf("openrouter: no choices in response")
	}

	content := orResp.Choices[0].Message.Content
	if content == "" {
		return "", fmt.Errorf("openrouter: empty response content")
	}

	return content, nil
}

// StreamChatCompletion streams a chat completion, invoking onToken for each token delta.
func (c *OpenRouterClient) StreamChatCompletion(ctx context.Context, systemPrompt, userPrompt string, onToken func(string) error) error {
	req, err := c.buildRequest(ctx, systemPrompt, userPrompt, true)
	if err != nil {
		return err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("openrouter request failed: %w", err)
	}
	defer resp.Body.Close()

	if err := mapStatusError(resp.StatusCode); err != nil {
		return err
	}

	reader := bufio.NewReaderSize(resp.Body, 4096)
	for {
		line, readErr := reader.ReadString('\n')
		if readErr != nil && readErr != io.EOF {
			return fmt.Errorf("read stream: %w", readErr)
		}

		line = strings.TrimSpace(strings.TrimRight(line, "\r\n"))
		if line != "" && strings.HasPrefix(line, "data:") {
			payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if payload == "[DONE]" {
				break
			}

			var chunk openRouterStreamChunk
			if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
				return fmt.Errorf("parse stream chunk: %w", err)
			}

			if len(chunk.Choices) > 0 {
				if token := chunk.Choices[0].Delta.Content; token != "" && onToken != nil {
					if err := onToken(token); err != nil {
						return fmt.Errorf("token callback: %w", err)
					}
				}
			}
		}

		if readErr == io.EOF {
			break
		}
	}

	return nil
}

// buildRequest constructs an OpenRouter chat-completions HTTP request with the
// client's configured model, temperature, and max-token settings. stream toggles
// the SSE streaming flag. The HTTP-Referer is set from the shared site constant.
func (c *OpenRouterClient) buildRequest(ctx context.Context, systemPrompt, userPrompt string, stream bool) (*http.Request, error) {
	body := openRouterRequest{
		Model:       c.model,
		Temperature: c.temperature,
		MaxTokens:   c.maxTokens,
		Stream:      stream,
		Messages: []openRouterMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
	}

	buf, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(buf))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", openRouterHTTPReferer)

	return req, nil
}

// mapStatusError converts a non-2xx OpenRouter HTTP status into a typed error.
func mapStatusError(code int) error {
	switch code {
	case http.StatusUnauthorized:
		return fmt.Errorf("openrouter: invalid API key")
	case http.StatusTooManyRequests:
		return fmt.Errorf("openrouter: rate limit exceeded")
	case 402:
		return fmt.Errorf("openrouter: insufficient credits")
	case 408, 524:
		return fmt.Errorf("openrouter: request timeout")
	case 502, 529:
		return fmt.Errorf("openrouter: provider temporarily unavailable")
	case http.StatusOK:
		return nil
	default:
		return fmt.Errorf("openrouter: unexpected status %d", code)
	}
}

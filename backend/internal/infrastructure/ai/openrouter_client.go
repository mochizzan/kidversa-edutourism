package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const openRouterMaxBodySize = 64 * 1024

type openRouterRequest struct {
	Model       string              `json:"model"`
	Messages    []openRouterMessage `json:"messages"`
	Temperature float64             `json:"temperature"`
	MaxTokens   int                 `json:"max_tokens"`
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
	apiKey  string
	model   string
	baseURL string
	client  *http.Client
}

// NewOpenRouterClient builds an OpenRouter HTTP client.
func NewOpenRouterClient(apiKey, model, baseURL string) *OpenRouterClient {
	return &OpenRouterClient{
		apiKey:  apiKey,
		model:   model,
		baseURL: baseURL,
		client: &http.Client{
			Timeout: 90 * time.Second,
		},
	}
}

// ChatCompletion sends a chat completion request and returns the assistant's response text.
func (c *OpenRouterClient) ChatCompletion(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	body := openRouterRequest{
		Model:       c.model,
		Temperature: 0.7,
		MaxTokens:   1024,
		Messages: []openRouterMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
	}

	buf, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(buf))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", "https://kidversa.id")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("openrouter request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		return "", fmt.Errorf("openrouter: invalid API key")
	}
	if resp.StatusCode == 429 {
		return "", fmt.Errorf("openrouter: rate limit exceeded")
	}
	if resp.StatusCode == 402 {
		return "", fmt.Errorf("openrouter: insufficient credits")
	}
	if resp.StatusCode == 408 || resp.StatusCode == 524 {
		return "", fmt.Errorf("openrouter: request timeout")
	}
	if resp.StatusCode == 502 || resp.StatusCode == 529 {
		return "", fmt.Errorf("openrouter: provider temporarily unavailable")
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("openrouter: unexpected status %d", resp.StatusCode)
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

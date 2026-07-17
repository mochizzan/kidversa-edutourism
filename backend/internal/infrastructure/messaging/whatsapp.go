package messaging

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// WhatsAppGateway is an OpenWA self-hosted gateway adapter. It implements
// repository.MessagingService by POSTing text messages to the gateway's
// send-text endpoint for a configured session.
type WhatsAppGateway struct {
	baseURL    string
	apiKey     string
	sessionID  string
	httpClient *http.Client
}

// NewWhatsAppGateway builds a gateway adapter from config.
func NewWhatsAppGateway(cfg *config.Config) repository.MessagingService {
	return &WhatsAppGateway{
		baseURL:    cfg.WhatsAppGatewayURL,
		apiKey:     cfg.WhatsAppAPIKey,
		sessionID:  cfg.WhatsAppSessionID,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// sendTextRequest is the OpenWA send-text payload.
type sendTextRequest struct {
	ChatID string `json:"chatId"`
	Text   string `json:"text"`
}

// SendTextMessage sends text to chatID via the gateway session.
func (g *WhatsAppGateway) SendTextMessage(ctx context.Context, chatID, text string) error {
	body, err := json.Marshal(sendTextRequest{ChatID: chatID, Text: text})
	if err != nil {
		return err
	}
	url := fmt.Sprintf("%s/api/sessions/%s/messages/send-text", g.baseURL, g.sessionID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if g.apiKey != "" {
		req.Header.Set("X-API-Key", g.apiKey)
	}

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("whatsapp: send failed (status %d): %s", resp.StatusCode, string(respBody))
		return fmt.Errorf("whatsapp gateway error (HTTP %d)", resp.StatusCode)
	}
	return nil
}

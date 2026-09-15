package messaging

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/pkg/constants"
)

// WhatsAppGateway is an OpenWA self-hosted gateway adapter. It implements
// repository.MessagingService by POSTing text messages to the gateway's
// send-text endpoint for a configured session.
//
// Session resolution (OpenWA uses random UUIDs as session IDs):
//  1. Primary: use WhatsAppSessionID from env as session NAME to search for
//  2. Fallback: auto-discover first active session via GET /api/sessions
//
// The backend searches sessions by NAME (not ID), because OpenWA auto-generates
// UUIDs as IDs. If the session is deleted and recreated, the backend will find
// it by name automatically.
type WhatsAppGateway struct {
	baseURL     string
	apiKey      string
	sessionName string // session NAME to search for (not UUID)
	httpClient  *http.Client

	// Auto-discover state
	discoveredID string // cached UUID of found session
	mu           sync.RWMutex
}

// NewWhatsAppGateway builds a gateway adapter from config.
func NewWhatsAppGateway(cfg *config.Config) repository.MessagingService {
	return &WhatsAppGateway{
		baseURL:     cfg.WhatsAppGatewayURL,
		apiKey:      cfg.WhatsAppAPIKey,
		sessionName: cfg.WhatsAppSessionID, // env var = session NAME to search for
		httpClient:  &http.Client{Timeout: constants.WhatsAppRequestTimeout},
	}
}

// sendTextRequest is the OpenWA send-text payload.
type sendTextRequest struct {
	ChatID string `json:"chatId"`
	Text   string `json:"text"`
}

// sessionInfo is the OpenWA session list response item.
type sessionInfo struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
	Phone  string `json:"phone"`
}

// resolveSessionID returns the UUID of the target session, using cache or auto-discover.
func (g *WhatsAppGateway) resolveSessionID(ctx context.Context) string {
	// Check cache first
	g.mu.RLock()
	if g.discoveredID != "" {
		id := g.discoveredID
		g.mu.RUnlock()
		return id
	}
	g.mu.RUnlock()

	// Auto-discover: query OpenWA for sessions
	g.mu.Lock()
	defer g.mu.Unlock()

	// Double-check after acquiring write lock
	if g.discoveredID != "" {
		return g.discoveredID
	}

	id := g.discoverActiveSession(ctx)
	if id != "" {
		g.discoveredID = id
		log.Printf("whatsapp: resolved session %q → UUID %s", g.sessionName, id)
	}
	return id
}

// discoverActiveSession queries GET /api/sessions and returns the UUID of
// the session matching g.sessionName. Falls back to first active session
// if no name match found. Returns empty string if no session available.
func (g *WhatsAppGateway) discoverActiveSession(ctx context.Context) string {
	url := g.baseURL + "/api/sessions"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		log.Printf("whatsapp: discover session request failed: %v", err)
		return ""
	}
	if g.apiKey != "" {
		req.Header.Set("X-API-Key", g.apiKey)
	}

	resp, err := g.httpClient.Do(req)
	if err != nil {
		log.Printf("whatsapp: discover session failed: %v", err)
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("whatsapp: discover session returned HTTP %d", resp.StatusCode)
		return ""
	}

	// The OpenWA /api/sessions endpoint returns a plain JSON array of sessions,
	// NOT wrapped in {"data": [...]}. Decode accordingly.
	var sessions []sessionInfo
	if err := json.NewDecoder(resp.Body).Decode(&sessions); err != nil {
		log.Printf("whatsapp: discover session decode failed: %v", err)
		return ""
	}

	// Priority 1: find session by NAME with active status
	for _, s := range sessions {
		if s.Name == g.sessionName && (s.Status == "running" || s.Status == "ready") {
			return s.ID
		}
	}

	// Priority 2: find any active session
	for _, s := range sessions {
		if s.Status == "running" || s.Status == "ready" {
			log.Printf("whatsapp: session name %q not found, using active session %q (name=%q)", g.sessionName, s.ID, s.Name)
			return s.ID
		}
	}

	// Priority 3: return first session if any
	if len(sessions) > 0 {
		log.Printf("whatsapp: no active session, using first session %q (name=%q, status=%s)", sessions[0].ID, sessions[0].Name, sessions[0].Status)
		return sessions[0].ID
	}

	return ""
}

// SendTextMessage sends text to chatID via the gateway session.
func (g *WhatsAppGateway) SendTextMessage(ctx context.Context, chatID, text string) error {
	body, err := json.Marshal(sendTextRequest{ChatID: chatID, Text: text})
	if err != nil {
		return err
	}

	sessionID := g.resolveSessionID(ctx)
	if sessionID == "" {
		return fmt.Errorf("whatsapp: no active session found")
	}

	if err := g.doSendMessage(ctx, body, sessionID); err != nil {
		// If send failed, check if it's a 404 and retry with fresh discovery
		// (doSendMessage already returned the error, we need to check the status)
		// For simplicity, we retry on any error by clearing cache
		log.Printf("whatsapp: send to %s failed, retrying with fresh discovery: %v", sessionID, err)
		g.mu.Lock()
		g.discoveredID = ""
		g.mu.Unlock()

		newID := g.resolveSessionID(ctx)
		if newID == "" || newID == sessionID {
			return err // no new session found, return original error
		}
		return g.doSendMessage(ctx, body, newID)
	}
	return nil
}

// doSendMessage is the low-level HTTP POST to send-text endpoint.
func (g *WhatsAppGateway) doSendMessage(ctx context.Context, body []byte, sessionID string) error {
	url := fmt.Sprintf("%s"+constants.WhatsAppSendTextPath, g.baseURL, sessionID)
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
		return fmt.Errorf("whatsapp gateway error (HTTP %d): %s", resp.StatusCode, string(respBody))
	}
	return nil
}

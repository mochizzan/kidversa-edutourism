package handler

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/pkg/sse"
)

// ConsentHandler serves /api/consent/* (parent responses + lookups + delivery).
type ConsentHandler struct {
	consent     repository.ConsentRepository
	sessionRepo repository.SessionRepository
	messaging   repository.MessagingService
	cfg         *config.Config
	hub         *sse.Hub
}

// NewConsentHandler builds the consent handler.
func NewConsentHandler(
	consent repository.ConsentRepository,
	sessionRepo repository.SessionRepository,
	messaging repository.MessagingService,
	cfg *config.Config,
	hub *sse.Hub,
) *ConsentHandler {
	return &ConsentHandler{consent: consent, sessionRepo: sessionRepo, messaging: messaging, cfg: cfg, hub: hub}
}

// Respond handles POST /api/consent/respond (parent decision + audit row).
func (h *ConsentHandler) Respond(c *echo.Context) error {
	var req dto.ConsentRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	ip := (*c).RealIP()
	ua := (*c).Request().UserAgent()
	if err := h.consent.Respond((*c).Request().Context(), req.ParticipantID, req.SessionID,
		entity.ConsentType(req.ConsentType), req.Value, ip, ua); err != nil {
		return err
	}
	return appresp.OK(c, map[string]string{"status": "recorded"})
}

// SendWhatsApp handles POST /api/consent/send-whatsapp (JWT, tenant-scoped):
// issues a combined consent token per eligible participant and asynchronously
// delivers the consent link via WhatsApp. Returns 202 + batch_id immediately;
// progress is streamed via /send-whatsapp/stream.
func (h *ConsentHandler) SendWhatsApp(c *echo.Context) error {
	var req dto.ConsentSendWhatsAppRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	tenantID := appmiddleware.GetTenantID(c)

	session, err := h.sessionRepo.GetSessionByID((*c).Request().Context(), req.SessionID, tenantID)
	if err != nil {
		return err
	}

	participants, err := h.sessionRepo.ListParticipants((*c).Request().Context(), req.SessionID, "", tenantID)
	if err != nil {
		return err
	}

	// Eligible participants: not yet fully consented, no active token, valid phone.
	eligible := make([]entity.Participant, 0, len(participants))
	now := time.Now().UTC()
	for _, p := range participants {
		if p.ConsentRecording && p.ConsentPhoto {
			continue
		}
		if p.ConsentCombinedToken != nil && p.ConsentCombinedTokenExpiresAt != nil && p.ConsentCombinedTokenExpiresAt.After(now) {
			continue
		}
		if !isValidWhatsAppPhone(p.ParentPhone) {
			continue
		}
		eligible = append(eligible, p)
	}

	if len(eligible) == 0 {
		return appresp.FailMsg(c, http.StatusConflict, "nothing_to_send", "Tidak ada peserta yang perlu dikirimi permintaan consent")
	}

	// Generate + persist a combined token per eligible participant. Each update
	// uses an atomic WHERE guard: only persist if no active token exists, preventing
	// concurrent requests from overwriting each other's tokens.
	batchID := persistence.NewUUID()
	for i := range eligible {
		token, terr := persistence.GenerateConsentToken()
		if terr != nil {
			return apperrors.Internal("internal_error", terr)
		}
		expiresAt := now.Add(h.cfg.ConsentTokenTTL)
		tokenCopy := token
		expiresCopy := expiresAt

		ok, uerr := h.sessionRepo.UpdateParticipantTokenIfAvailable((*c).Request().Context(), eligible[i].ID, tokenCopy, expiresCopy)
		if uerr != nil {
			return uerr
		}
		if !ok {
			// Token already set by a concurrent request — skip this participant.
			eligible[i].ConsentCombinedToken = nil
			eligible[i].ConsentCombinedTokenExpiresAt = nil
			continue
		}
		eligible[i].ConsentCombinedToken = &tokenCopy
		eligible[i].ConsentCombinedTokenExpiresAt = &expiresCopy
	}

	// Filter out participants whose tokens were skipped (race).
	active := make([]entity.Participant, 0, len(eligible))
	for _, p := range eligible {
		if p.ConsentCombinedToken != nil {
			active = append(active, p)
		}
	}
	if len(active) == 0 {
		return appresp.FailMsg(c, http.StatusConflict, "nothing_to_send", "Tidak ada peserta yang perlu dikirimi permintaan consent — semua sudah memiliki token aktif")
	}

	// Fire-and-forget batch worker. Use a detached context so the outbound
	// WhatsApp calls are not cancelled when this request returns the 202.
	go h.processWhatsAppBatch(context.WithoutCancel((*c).Request().Context()), active, *session, batchID)

	return appresp.AcceptedWithData(c, dto.ConsentSendWhatsAppResponse{
		Status:  "queued",
		BatchID: batchID,
		Total:   len(active),
	})
}

// processWhatsAppBatch delivers the consent links sequentially with a random
// delay between sends (rate-limiting to avoid WhatsApp bans). It publishes SSE
// progress events on the consent:<batchID> channel.
func (h *ConsentHandler) processWhatsAppBatch(ctx context.Context, participants []entity.Participant, session entity.Session, batchID string) {
	total := len(participants)
	sent := 0
	for i, p := range participants {
		status := "sent"
		errMsg := ""
		if p.ConsentCombinedToken == nil {
			status = "failed"
			errMsg = "token tidak tersedia"
		} else {
			chatID := normalizeWhatsAppPhone(p.ParentPhone) + "@c.us"
			url := fmt.Sprintf("%s?token=%s", h.cfg.ParentConsentBaseURL, *p.ConsentCombinedToken)
			msg := buildConsentMessage(p.ParentName, p.ChildName, session.Name, session.SessionDate, session.Location, url)
			if serr := h.messaging.SendTextMessage(ctx, chatID, msg); serr != nil {
				status = "failed"
				errMsg = "Gagal mengirim WhatsApp"
				log.Printf("consent: whatsapp send failed for participant %s: %v", p.ID, serr)
			} else {
				sent++
			}
		}

		h.hub.Publish(ctx, sse.ConsentChannel(batchID), sse.Event{
			Type: "progress",
			Data: dto.ConsentParticipantResult{
				ParticipantID: p.ID,
				ChildName:     p.ChildName,
				ParentPhone:   p.ParentPhone,
				Status:        status,
				Error:         errMsg,
			},
		})

		if i < total-1 {
			delay := time.Duration(15+rand.Intn(30)) * time.Second
			time.Sleep(delay)
		}
	}

	h.hub.Publish(ctx, sse.ConsentChannel(batchID), sse.Event{
		Type: "done",
		Data: map[string]interface{}{
			"sent":   sent,
			"failed": total - sent,
			"total":  total,
		},
	})
}

// SendWhatsAppStream handles GET /api/consent/send-whatsapp/stream (SSE, JWT):
// streams batch progress until the "done" event.
func (h *ConsentHandler) SendWhatsAppStream(c *echo.Context) error {
	batchID := (*c).QueryParam("batch_id")
	if batchID == "" {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	return streamSSE(c, h.hub, sse.ConsentChannel(batchID), nil, h.cfg.SSEKeepaliveSec)
}

// RespondCombined handles POST /api/consent/respond-combined (PUBLIC): records a
// parent's combined recording+photo consent via a single combined token. It
// writes two consent_log audit rows, syncs the participant consent fields (so
// facilitator pages see it), and clears the token.
func (h *ConsentHandler) RespondCombined(c *echo.Context) error {
	var req dto.ConsentRespondCombinedRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}

	participant, err := h.consent.GetByCombinedToken((*c).Request().Context(), req.Token)
	if err != nil {
		return err
	}

	// Replay / expiry protection.
	if participant.ConsentCombinedTokenExpiresAt != nil && time.Now().UTC().After(*participant.ConsentCombinedTokenExpiresAt) {
		return apperrors.Forbidden("token_expired", fmt.Errorf("consent token expired"))
	}

	sessionID := ""
	if participant.SessionID != nil {
		sessionID = *participant.SessionID
	}

	ip := (*c).RealIP()
	ua := (*c).Request().UserAgent()
	if rerr := h.consent.Respond((*c).Request().Context(), participant.ID, sessionID,
		entity.ConsentRecording, req.Recording, ip, ua); rerr != nil {
		return rerr
	}
	if rerr := h.consent.Respond((*c).Request().Context(), participant.ID, sessionID,
		entity.ConsentPhoto, req.Photo, ip, ua); rerr != nil {
		return rerr
	}

	now := time.Now().UTC()
	nowCopy := now
	// Single map-based update: persists both true AND false consent values (C2)
	// and clears the combined token in one round-trip (replay protection).
	if uerr := h.sessionRepo.UpdateParticipantFields((*c).Request().Context(), participant.ID, map[string]interface{}{
		"consent_recording":                 req.Recording,
		"consent_photo":                     req.Photo,
		"consent_at":                        &nowCopy,
		"consent_combined_token":            nil,
		"consent_combined_token_expires_at": nil,
	}); uerr != nil {
		return uerr
	}

	return appresp.OK(c, dto.ConsentRespondCombinedResponse{
		Status:     "recorded",
		ChildName:  participant.ChildName,
		ParentName: participant.ParentName,
	})
}

// Summary handles GET /api/consent/summary (JWT): returns consent logs for
// multiple sessions in one call, grouped by session_id.
func (h *ConsentHandler) Summary(c *echo.Context) error {
	idsRaw := (*c).QueryParam("session_ids")
	if idsRaw == "" {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	ids := strings.Split(idsRaw, ",")
	grouped, err := h.consent.ListBySessionIDs((*c).Request().Context(), ids)
	if err != nil {
		return err
	}
	result := make([]dto.ConsentSummaryItem, 0, len(ids))
	for _, sid := range ids {
		logs := grouped[sid]
		if logs == nil {
			logs = []entity.ConsentLog{}
		}
		result = append(result, dto.ConsentSummaryItem{
			SessionID: sid,
			Items:     dto.NewConsentListResponse(logs).Items,
		})
	}
	return appresp.OK(c, dto.ConsentSummaryResponse{Sessions: result})
}

// List handles GET /api/consent (JWT): ?session_id= → by session, otherwise ?participant_id= → by participant.
func (h *ConsentHandler) List(c *echo.Context) error {
	sid := (*c).QueryParam("session_id")
	if sid != "" {
		items, err := h.consent.ListBySession((*c).Request().Context(), sid)
		if err != nil {
			return err
		}
		return appresp.OK(c, dto.NewConsentListResponse(items))
	}
	pid := (*c).QueryParam("participant_id")
	if pid == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	items, err := h.consent.ListByParticipant((*c).Request().Context(), pid)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewConsentListResponse(items))
}

// digitRe matches any non-digit character, used to strip formatting from phone numbers.
var digitRe = regexp.MustCompile(`\D`)

// isValidWhatsAppPhone reports whether the phone looks like an Indonesian number.
func isValidWhatsAppPhone(phone string) bool {
	digits := digitRe.ReplaceAllString(phone, "")
	if len(digits) < 9 {
		return false
	}
	return strings.HasPrefix(digits, "0") || strings.HasPrefix(digits, "62")
}

// normalizeWhatsAppPhone converts a local Indonesian number to the international
// format used by WhatsApp chat IDs (e.g. "08123123456" → "628123123456").
func normalizeWhatsAppPhone(phone string) string {
	digits := digitRe.ReplaceAllString(phone, "")
	if strings.HasPrefix(digits, "0") {
		digits = "62" + digits[1:]
	}
	return digits
}

// buildConsentMessage composes the Indonesian WhatsApp consent request.
func buildConsentMessage(parentName, childName, sessionName, sessionDate, location, url string) string {
	return fmt.Sprintf(`Kidversa Edutourism 🎓

Halo Bapak/Ibu %s,

Kami dari Kidversa Edutourism meminta persetujuan Anda untuk kegiatan edutourism anak %s.

📋 Sesi: %s
📅 Tanggal: %s
📍 Lokasi: %s

Mohon berikan izin untuk:
• Rekaman suara selama kegiatan
• Pengambilan foto selama kegiatan

Klik tautan berikut untuk memberikan persetujuan:
%s

Terima kasih 🙏`, parentName, childName, sessionName, sessionDate, location, url)
}

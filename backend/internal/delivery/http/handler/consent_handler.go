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
	if err := h.consent.RespondConsent((*c).Request().Context(), req.ParticipantID, req.SessionID,
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

	// force is an optional query flag (?force=true): clears any active tokens for
	// the session so stuck/undelivered batches can be re-sent before TTL expiry.
	force := (*c).QueryParam("force") == "true"

	session, err := h.sessionRepo.GetSessionByID((*c).Request().Context(), req.SessionID, tenantID)
	if err != nil {
		return err
	}

	participants, err := h.sessionRepo.ListParticipants((*c).Request().Context(), req.SessionID, "", tenantID)
	if err != nil {
		return err
	}

	if force {
		if cerr := h.sessionRepo.ClearParticipantTokens((*c).Request().Context(), req.SessionID, tenantID); cerr != nil {
			return cerr
		}
	}

	// Eligible participants: not yet fully consented, no active token, valid phone.
	eligible := make([]entity.Participant, 0, len(participants))
	now := time.Now().UTC()
	ctx := (*c).Request().Context()
	for _, p := range participants {
		recGranted, _ := h.consent.GetConsentValue(ctx, p.ID, req.SessionID, entity.ConsentRecording)
		photoGranted, _ := h.consent.GetConsentValue(ctx, p.ID, req.SessionID, entity.ConsentPhoto)
		if recGranted && photoGranted {
			continue
		}
		// When force=true we already cleared tokens above (lines 86-90), so skip
		// this active-token guard and re-eligibilize everyone not yet consented.
		if !force && p.ConsentCombinedToken != nil && p.ConsentCombinedTokenExpiresAt != nil && p.ConsentCombinedTokenExpiresAt.After(now) {
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
			msg := buildConsentMessage(p.ParentName, p.ChildName, session.Name, formatSessionDateID(session.SessionDate), session.Location, url)
			if serr := h.messaging.SendTextMessage(ctx, chatID, msg); serr != nil {
				status = "failed"
				errMsg = "Gagal mengirim WhatsApp"
				log.Printf("consent: whatsapp send failed for participant %s: %v", p.ID, serr)
			} else {
				sent++
				// Record that consent requests were sent (audit trail) for each
				// participant type. Failures are non-fatal — just log them.
				sessionID := ""
				if p.SessionID != nil {
					sessionID = *p.SessionID
				}
				if sessionID != "" {
					if sErr := h.consent.SendConsentRequest(ctx, p.ID, sessionID, entity.ConsentRecording); sErr != nil {
						log.Printf("consent: send-request record failed for %s RECORDING: %v", p.ID, sErr)
					}
					if sErr := h.consent.SendConsentRequest(ctx, p.ID, sessionID, entity.ConsentPhoto); sErr != nil {
						log.Printf("consent: send-request record failed for %s PHOTO: %v", p.ID, sErr)
					}
				}
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

	participant, err := h.consent.GetParticipantByConsentToken((*c).Request().Context(), req.Token)
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
	if rerr := h.consent.RespondConsent((*c).Request().Context(), participant.ID, sessionID,
		entity.ConsentRecording, req.Recording, ip, ua); rerr != nil {
		return rerr
	}
	if rerr := h.consent.RespondConsent((*c).Request().Context(), participant.ID, sessionID,
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

// Info handles GET /api/consent/info?token= (PUBLIC): returns a stripped,
// non-sensitive snapshot (child name, session name/date/location) so the parent
// consent page can be personalized and informative. No auth — the token is the
// bearer. A valid, unexpired token yields status "ok"; an expired token yields
// "expired"; an unknown or already-consumed token yields "invalid".
func (h *ConsentHandler) Info(c *echo.Context) error {
	token := (*c).QueryParam("token")
	if token == "" {
		return appresp.OK(c, dto.ConsentInfoResponse{Status: "invalid"})
	}

	participant, err := h.consent.GetParticipantByConsentToken((*c).Request().Context(), token)
	if err != nil {
		// Already-consumed tokens are cleared, so they read as not-found.
		return appresp.OK(c, dto.ConsentInfoResponse{Status: "invalid"})
	}

	if participant.ConsentCombinedTokenExpiresAt != nil && time.Now().UTC().After(*participant.ConsentCombinedTokenExpiresAt) {
		return appresp.OK(c, dto.ConsentInfoResponse{Status: "expired"})
	}

	res := dto.ConsentInfoResponse{
		Status:     "ok",
		ChildName:  participant.ChildName,
		ParentName: participant.ParentName,
	}
	if participant.SessionID != nil && *participant.SessionID != "" {
		if session, serr := h.sessionRepo.GetSessionByID((*c).Request().Context(), *participant.SessionID, ""); serr == nil {
			res.SessionName = session.Name
			res.SessionDate = session.SessionDate
			res.Location = session.Location
		}
	}
	return appresp.OK(c, res)
}

// Summary handles GET /api/consent/summary (JWT): returns consent logs for
// multiple sessions in one call, grouped by session_id.
func (h *ConsentHandler) Summary(c *echo.Context) error {
	idsRaw := (*c).QueryParam("session_ids")
	if idsRaw == "" {
		return appresp.OK(c, dto.ConsentSummaryResponse{Sessions: []dto.ConsentSummaryItem{}})
	}
	ids := strings.Split(idsRaw, ",")
	grouped, err := h.consent.ListConsentsBySessionIDs((*c).Request().Context(), ids)
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
		items, err := h.consent.ListConsentsBySession((*c).Request().Context(), sid)
		if err != nil {
			return err
		}
		return appresp.OK(c, dto.NewConsentListResponse(items))
	}
	pid := (*c).QueryParam("participant_id")
	if pid == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	items, err := h.consent.ListConsentsByParticipant((*c).Request().Context(), pid)
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

// indoMonths maps a 1-based month number to its Indonesian name.
var indoMonths = [...]string{
	"", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
}

// wibLocation is the Asia/Jakarta (WIB) location, resolved once. Falls back to a
// fixed +07:00 offset if the tz database is unavailable.
var wibLocation = func() *time.Location {
	if loc, err := time.LoadLocation("Asia/Jakarta"); err == nil {
		return loc
	}
	return time.FixedZone("WIB", 7*3600)
}()

// formatSessionDateID renders a stored session date into a human-friendly
// Indonesian format (e.g. "15 Juli 2026"). It accepts either an RFC3339
// timestamp ("2026-07-15T00:00:00+07:00") or a plain date ("2026-07-15"). The
// raw value is returned unchanged if it cannot be parsed.
func formatSessionDateID(raw string) string {
	if raw == "" {
		return raw
	}
	layouts := []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02"}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			t = t.In(wibLocation)
			return fmt.Sprintf("%d %s %d", t.Day(), indoMonths[int(t.Month())], t.Year())
		}
	}
	return raw
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

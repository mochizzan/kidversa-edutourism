package handler

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// ConsentHandler serves /api/consent/* (parent responses + lookups).
type ConsentHandler struct {
	consent     repository.ConsentRepository
	sessionRepo repository.SessionRepository
}

// NewConsentHandler builds the consent handler.
func NewConsentHandler(consent repository.ConsentRepository, sessionRepo repository.SessionRepository) *ConsentHandler {
	return &ConsentHandler{consent: consent, sessionRepo: sessionRepo}
}

// Respond handles POST /api/consent/respond (parent decision + audit row).
func (h *ConsentHandler) Respond(c *echo.Context) error {
	var req dto.ConsentRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	ip := (*c).RealIP()
	ua := (*c).Request().UserAgent()
	if err := h.consent.Respond((*c).Request().Context(), req.ParticipantID, req.SessionID,
		entity.ConsentType(req.ConsentType), req.Value, ip, ua); err != nil {
		return err
	}
	return appresp.OK(c, map[string]string{"status": "recorded"})
}

// Request handles POST /api/consent/request (JWT): issues a single-use consent
// token (plan B10) for a (participant, session, type) triple.
func (h *ConsentHandler) Request(c *echo.Context) error {
	var req dto.ConsentRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if req.ParticipantID == "" || req.SessionID == "" || req.ConsentType == "" {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	ct := entity.ConsentType(req.ConsentType)
	if ct != entity.ConsentRecording && ct != entity.ConsentPhoto {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	token, err := h.consent.SendRequest((*c).Request().Context(), req.ParticipantID, req.SessionID, ct)
	if err != nil {
		return err
	}
	return appresp.OK(c, map[string]string{"token": token})
}

// RespondPublic handles POST /api/consent/respond-public?token= (PUBLIC): records a
// parent's consent decision via a single-use token. The PII returned is derived from
// the consent's participant (NOT a public participant endpoint — plan C9/SC2).
func (h *ConsentHandler) RespondPublic(c *echo.Context) error {
	token := (*c).QueryParam("token")
	if token == "" {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	var req dto.ConsentPublicRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	ip := (*c).RealIP()
	ua := (*c).Request().UserAgent()
	if err := h.consent.RespondByToken((*c).Request().Context(), token, req.Value, ip, ua); err != nil {
		return err
	}
	// Derive PII from the consent's participant (anti-IDOR: token-bound, not a public lookup).
	pii, err := h.participantPIIByToken((*c).Request().Context(), token)
	if err != nil {
		// Token already consumed; the decision is recorded but we cannot re-read it.
		return appresp.OK(c, map[string]string{"status": "recorded"})
	}
	return appresp.OK(c, pii)
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

// participantPIIByToken re-reads the (already-consumed) consent row by token to derive
// the owning participant's PII for the response. Returns nil (no error) if not found.
func (h *ConsentHandler) participantPIIByToken(ctx context.Context, token string) (map[string]string, error) {
	log, err := h.consent.GetByToken(ctx, token)
	if err != nil {
		return nil, nil
	}
	p, perr := h.sessionRepo.GetParticipantByID(ctx, log.ParticipantID)
	if perr != nil {
		return nil, nil
	}
	return map[string]string{
		"child_name":  p.ChildName,
		"parent_name": p.ParentName,
		"status":      "recorded",
	}, nil
}

// ensure imports referenced.
var _ = appmiddleware.GetUserID

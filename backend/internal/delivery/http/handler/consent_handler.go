package handler

import (
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
	consent repository.ConsentRepository
}

// NewConsentHandler builds the consent handler.
func NewConsentHandler(consent repository.ConsentRepository) *ConsentHandler {
	return &ConsentHandler{consent: consent}
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

// ListByParticipant handles GET /api/consent?participant_id=.
func (h *ConsentHandler) ListByParticipant(c *echo.Context) error {
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

// ensure imports referenced.
var _ = appmiddleware.GetUserID

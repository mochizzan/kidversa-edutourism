package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	reportsuc "kidversa-edutourism-backend/internal/usecase/reports"
)

// ReportHandler serves /api/reports/* (authenticated) and the public token
// access endpoint. Parent access tokens are anti-IDOR: unguessable 64hex,
// single-report scope, expiry, revocation.
type ReportHandler struct {
	uc *reportsuc.Usecase
}

// NewReportHandler builds the report handler.
func NewReportHandler(uc *reportsuc.Usecase) *ReportHandler {
	return &ReportHandler{uc: uc}
}

// GetByAccessToken handles GET /api/reports/access?token=... (PUBLIC).
// Verifies the token (64hex, not revoked, not expired) and returns a DTO
// stripped of PII and the token itself.
func (h *ReportHandler) GetByAccessToken(c *echo.Context) error {
	token := (*c).QueryParam("token")
	if token == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	r, err := h.uc.Repo().GetByToken((*c).Request().Context(), token)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewPublicReportDTO(r))
}

// Generate handles POST /api/reports/:id/generate (async narrative placeholder).
func (h *ReportHandler) Generate(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	if err := h.uc.StreamNarrative((*c).Request().Context(), id); err != nil {
		return err
	}
	return appresp.Accepted(c)
}

// Approve handles POST /api/reports/:id/approve.
func (h *ReportHandler) Approve(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.ReportApproveRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	r, err := h.uc.Approve((*c).Request().Context(), id, req.ApprovedBy)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportResponse(r))
}

// Send handles POST /api/reports/:id/send (generates a fresh parent token).
func (h *ReportHandler) Send(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ttl := 72
	var req dto.ReportSendRequest
	if err := (*c).Bind(&req); err == nil && req.TTLHours > 0 {
		ttl = req.TTLHours
	}
	r, err := h.uc.Send((*c).Request().Context(), id, ttl)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportTokenResponse(r))
}

// RevokeToken handles POST /api/reports/:id/revoke-token.
func (h *ReportHandler) RevokeToken(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	r, err := h.uc.RevokeToken((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportResponse(r))
}

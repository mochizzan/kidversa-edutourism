package handler

import (
	"math"
	"net/http"

	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	reportsuc "kidversa-edutourism-backend/internal/usecase/reports"
)

// ReportHandler serves /api/reports/* (authenticated) and the public token
// access endpoint. Parent access tokens are anti-IDOR: unguessable 64hex,
// single-report scope, expiry, revocation.
type ReportHandler struct {
	uc  *reportsuc.Usecase
	cfg *config.Config
}

// NewReportHandler builds the report handler.
func NewReportHandler(uc *reportsuc.Usecase, cfg *config.Config) *ReportHandler {
	return &ReportHandler{uc: uc, cfg: cfg}
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
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	r, err := h.uc.Approve((*c).Request().Context(), id, req.ApprovedBy)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportResponse(r))
}

// Send handles POST /api/reports/:id/send (generates a fresh parent token).
// The token TTL defaults to the configured ReportTokenTTL, overridable per
// request via ReportSendRequest.TTLHours.
func (h *ReportHandler) Send(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	// Default to the configured report token TTL; allow a positive per-request override.
	ttl := int(math.Round(h.cfg.ReportTokenTTL.Hours()))
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

// ListReports handles GET /api/reports?session_id= (tenant-scoped via TenantScope).
// Returns an empty list (not an error) when no reports match (EC4).
func (h *ReportHandler) ListReports(c *echo.Context) error {
	f := repository.ReportFilter{
		SessionID: (*c).QueryParam("session_id"),
	}
	page, limit := pagination(c)
	res, err := h.uc.Repo().List((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	meta := &appresp.Meta{Page: page, Limit: limit, Total: res.Total}
	return appresp.OKWithMeta(c, dto.NewReportListResponse(res.Items), meta)
}

// GetReport handles GET /api/reports/:id (tenant-scoped via TenantScope).
func (h *ReportHandler) GetReport(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	r, err := h.uc.Repo().GetByID((*c).Request().Context(), id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportResponse(r))
}

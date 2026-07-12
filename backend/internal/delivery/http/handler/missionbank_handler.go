package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// MissionBankHandler serves /api/mission-banks/* (CRUD over mission templates).
type MissionBankHandler struct {
	repo repository.MissionBankRepository
}

// NewMissionBankHandler builds the mission-bank handler.
func NewMissionBankHandler(repo repository.MissionBankRepository) *MissionBankHandler {
	return &MissionBankHandler{repo: repo}
}

// Create handles POST /api/mission-banks.
func (h *MissionBankHandler) Create(c *echo.Context) error {
	var req dto.MissionBankRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	m := &entity.MissionBank{
		TenantID:           req.TenantID,
		ProgramID:          req.ProgramID,
		Category:           entity.MissionCategory(req.Category),
		TitleChild:         req.TitleChild,
		TitleParent:        req.TitleParent,
		DescriptionParent:  req.DescriptionParent,
		RelatedStageIDsJSON: entity.RawJSON(req.RelatedStageIDsJSON),
		IsActive:           req.IsActive,
	}
	if err := h.repo.Create((*c).Request().Context(), m); err != nil {
		return err
	}
	return appresp.Created(c, dto.NewMissionBankResponse(m))
}

// GetByID handles GET /api/mission-banks/:id.
func (h *MissionBankHandler) GetByID(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	m, err := h.repo.GetByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewMissionBankResponse(m))
}

// List handles GET /api/mission-banks.
func (h *MissionBankHandler) List(c *echo.Context) error {
	f := repository.MissionBankFilter{
		TenantID:  (*c).QueryParam("tenant_id"),
		ProgramID: (*c).QueryParam("program_id"),
		Category:  (*c).QueryParam("category"),
	}
	if v := (*c).QueryParam("is_active"); v == "true" {
		t := true
		f.IsActive = &t
	} else if v == "false" {
		f2 := false
		f.IsActive = &f2
	}
	page, limit := pagination(c)
	res, err := h.repo.List((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, dto.NewMissionBankListResponse(res.Items), &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

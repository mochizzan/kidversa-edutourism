package handler

import (
	"net/http"
	"regexp"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/pkg/util"
)

var galleryTokenFormat = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

// GalleryHandler serves public gallery access + authenticated token management.
type GalleryHandler struct {
	galleryRepo repository.GalleryTokenRepository
	reportRepo  repository.ReportRepository
	photoRepo   repository.PhotoRepository
	sessionRepo repository.SessionRepository
	consentRepo repository.ConsentRepository
	cfg         *config.Config
}

// NewGalleryHandler builds the gallery handler.
func NewGalleryHandler(
	galleryRepo repository.GalleryTokenRepository,
	reportRepo repository.ReportRepository,
	photoRepo repository.PhotoRepository,
	sessionRepo repository.SessionRepository,
	consentRepo repository.ConsentRepository,
	cfg *config.Config,
) *GalleryHandler {
	return &GalleryHandler{
		galleryRepo: galleryRepo,
		reportRepo:  reportRepo,
		photoRepo:   photoRepo,
		sessionRepo: sessionRepo,
		consentRepo: consentRepo,
		cfg:         cfg,
	}
}

// GetByToken handles GET /api/reports/gallery?token={64hex} (PUBLIC).
// Returns all consented photos for the child associated with the gallery token.
func (h *GalleryHandler) GetByToken(c *echo.Context) error {
	token := (*c).QueryParam("token")
	if token == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	if !galleryTokenFormat.MatchString(token) {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	ctx := (*c).Request().Context()

	gt, err := h.galleryRepo.GetByToken(ctx, token)
	if err != nil {
		return err
	}
	if gt.Revoked {
		return appresp.Fail(c, http.StatusGone, "token_revoked")
	}
	if time.Now().After(gt.ExpiresAt) {
		return appresp.Fail(c, http.StatusGone, "token_expired")
	}

	participant, err := h.sessionRepo.GetParticipantByID(ctx, gt.ParticipantID, "")
	if err != nil {
		return err
	}
	report, err := h.reportRepo.GetByIDPublic(ctx, gt.ReportID)
	if err != nil {
		return err
	}

	// Consent gate: only show photos when parent has granted PHOTO consent.
	granted, err := h.consentRepo.GetConsentValue(ctx, gt.ParticipantID, gt.SessionID, entity.ConsentPhoto)
	if err != nil {
		return err
	}
	if !granted {
		return appresp.Fail(c, http.StatusForbidden, "consent_required")
	}

	photos, err := h.photoRepo.ListPhotos(ctx, repository.PhotoFilter{
		ParticipantID: gt.ParticipantID,
		SessionID:     gt.SessionID,
	}, 1, 100)
	if err != nil {
		return err
	}

	return appresp.OK(c, dto.NewPublicGalleryDTO(report, participant, photos.Items))
}

// GenerateToken handles POST /api/reports/:id/gallery-token (JWT).
// Creates a new gallery token for an approved report.
func (h *GalleryHandler) GenerateToken(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	ctx := (*c).Request().Context()

	r, err := h.reportRepo.GetByID(ctx, id, tenantID)
	if err != nil {
		return err
	}
	if r.Status != entity.ReportApproved {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}

	tok, terr := util.RandomToken()
	if terr != nil {
		return appresp.Fail(c, http.StatusInternalServerError, "internal_error")
	}
	gt := &entity.GalleryToken{
		ReportID:      r.ID,
		ParticipantID: r.ParticipantID,
		SessionID:     r.SessionID,
		TenantID:      tenantID,
		Token:         tok,
		ExpiresAt:     time.Now().UTC().Add(h.cfg.GalleryTokenTTL),
		Revoked:       false,
	}
	if err := h.galleryRepo.Create(ctx, gt); err != nil {
		return err
	}

	// Update report entity with gallery token metadata.
	r.GalleryAccessToken = gt.Token
	r.GalleryTokenExpiresAt = &gt.ExpiresAt
	r.GalleryTokenRevoked = false
	if err := h.reportRepo.Update(ctx, r); err != nil {
		return err
	}

	return appresp.OK(c, map[string]string{"token": gt.Token})
}

// RevokeToken handles POST /api/reports/:id/revoke-gallery-token (JWT).
// Revokes the gallery token for a report so the QR code no longer works.
func (h *GalleryHandler) RevokeToken(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	ctx := (*c).Request().Context()

	r, err := h.reportRepo.GetByID(ctx, id, tenantID)
	if err != nil {
		return err
	}
	if err := h.galleryRepo.RevokeByReportID(ctx, id); err != nil {
		return err
	}
	r.GalleryTokenRevoked = true
	if err := h.reportRepo.Update(ctx, r); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

package handler

import (
	"net/http"
	"regexp"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

var galleryTokenFormat = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

// GalleryHandler serves the public gallery token view (photos for a QR-scanned
// gallery token).
type GalleryHandler struct {
	galleryRepo repository.GalleryTokenRepository
	reportRepo  repository.ReportRepository
	photoRepo   repository.PhotoRepository
	sessionRepo repository.SessionRepository
	consentRepo repository.ConsentRepository
}

// NewGalleryHandler builds the gallery handler.
func NewGalleryHandler(
	galleryRepo repository.GalleryTokenRepository,
	reportRepo repository.ReportRepository,
	photoRepo repository.PhotoRepository,
	sessionRepo repository.SessionRepository,
	consentRepo repository.ConsentRepository,
) *GalleryHandler {
	return &GalleryHandler{
		galleryRepo: galleryRepo,
		reportRepo:  reportRepo,
		photoRepo:   photoRepo,
		sessionRepo: sessionRepo,
		consentRepo: consentRepo,
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

	resolved, err := resolveReportPhoto(ctx, h.photoRepo, gt.ParticipantID, gt.SessionID, report.ProgramStageID)
	if err != nil {
		return err
	}
	var reportPhotoID string
	if resolved != nil {
		reportPhotoID = resolved.ID
	}

	photos, err := h.photoRepo.ListPhotos(ctx, repository.PhotoFilter{
		ParticipantID: gt.ParticipantID,
		SessionID:     gt.SessionID,
	}, 1, 100)
	if err != nil {
		return err
	}

	return appresp.OK(c, dto.NewPublicGalleryDTO(report, participant, photos.Items, reportPhotoID))
}

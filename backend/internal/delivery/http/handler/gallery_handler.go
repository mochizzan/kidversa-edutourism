package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

var galleryTokenFormat = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

// GalleryHandler serves the public gallery token view (photos for a QR-scanned
// gallery token).
type GalleryHandler struct {
	cfg         *config.Config
	galleryRepo repository.GalleryTokenRepository
	reportRepo  repository.ReportRepository
	photoRepo   repository.PhotoRepository
	sessionRepo repository.SessionRepository
	consentRepo repository.ConsentRepository
}

// NewGalleryHandler builds the gallery handler.
func NewGalleryHandler(
	cfg *config.Config,
	galleryRepo repository.GalleryTokenRepository,
	reportRepo repository.ReportRepository,
	photoRepo repository.PhotoRepository,
	sessionRepo repository.SessionRepository,
	consentRepo repository.ConsentRepository,
) *GalleryHandler {
	return &GalleryHandler{
		cfg:         cfg,
		galleryRepo: galleryRepo,
		reportRepo:  reportRepo,
		photoRepo:   photoRepo,
		sessionRepo: sessionRepo,
		consentRepo: consentRepo,
	}
}

// resolveGalleryToken runs the shared validation of the public gallery routes
// (GetByToken and GetPhoto) so the two can never drift: empty/!64hex → 400
// bad_request, unknown token → the repo's 404 token_invalid, revoked → 410
// token_revoked, expired → 410 token_expired. It returns (nil, nil) when a
// failure response was already written — the caller must then return nil
// immediately; (nil, err) means a real error to propagate.
func (h *GalleryHandler) resolveGalleryToken(c *echo.Context) (*entity.GalleryToken, error) {
	token := (*c).QueryParam("token")
	if token == "" || !galleryTokenFormat.MatchString(token) {
		return nil, appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	gt, err := h.galleryRepo.GetByToken((*c).Request().Context(), token)
	if err != nil {
		return nil, err
	}
	if gt.Revoked {
		return nil, appresp.Fail(c, http.StatusGone, "token_revoked")
	}
	if time.Now().After(gt.ExpiresAt) {
		return nil, appresp.Fail(c, http.StatusGone, "token_expired")
	}
	return gt, nil
}

// requirePhotoConsent runs the shared PHOTO-consent gate of the gallery routes:
// 403 consent_required (written) when the parent has not granted consent —
// identical codes in GetByToken and GetPhoto. Returns (true, nil) when
// granted, (false, nil) when the 403 was already written, (false, err) on
// repo failure.
func (h *GalleryHandler) requirePhotoConsent(c *echo.Context, gt *entity.GalleryToken) (bool, error) {
	granted, err := h.consentRepo.GetConsentValue((*c).Request().Context(), gt.ParticipantID, gt.SessionID, entity.ConsentPhoto)
	if err != nil {
		return false, err
	}
	if !granted {
		return false, appresp.Fail(c, http.StatusForbidden, "consent_required")
	}
	return true, nil
}

// GetByToken handles GET /api/reports/gallery?token={64hex} (PUBLIC).
// Returns all consented photos for the child associated with the gallery token.
func (h *GalleryHandler) GetByToken(c *echo.Context) error {
	gt, err := h.resolveGalleryToken(c)
	if err != nil || gt == nil {
		return err
	}
	ctx := (*c).Request().Context()

	participant, err := h.sessionRepo.GetParticipantByID(ctx, gt.ParticipantID, "")
	if err != nil {
		return err
	}
	report, err := h.reportRepo.GetByIDPublic(ctx, gt.ReportID)
	if err != nil {
		return err
	}

	// Consent gate: only show photos when parent has granted PHOTO consent.
	if ok, err := h.requirePhotoConsent(c, gt); err != nil || !ok {
		return err
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

// GetPhoto handles GET /api/reports/gallery/photo/:photoId?token={64hex}&variant=framed|original
// (PUBLIC): serves the raw bytes of ONE gallery photo for the public gallery
// <img>. The gallery token is the authn — token validation
// (resolveGalleryToken) and the consent gate (requirePhotoConsent) are shared
// with GetByToken so the two routes cannot drift, and NO byte is served before
// both pass.
//
// Anti-IDOR: the photo must belong to the token's participant+session — any
// other photo ID (another child's, another session's, a deleted row) answers
// 404, so a token can never read a gallery it does not own.
//
// Path selection: variant=framed → framed_file_url when present, falling back
// to original_file_url; anything else (absent/"original") → original_file_url.
// The bytes are read from cfg.UploadDir with the same disk-safety pattern as
// report_handler.GetAccessPhoto (withinDir bounds check, HTML refused,
// image/*-only content type, 404 when the file is missing).
func (h *GalleryHandler) GetPhoto(c *echo.Context) error {
	gt, err := h.resolveGalleryToken(c)
	if err != nil || gt == nil {
		return err
	}
	if ok, err := h.requirePhotoConsent(c, gt); err != nil || !ok {
		return err
	}
	ctx := (*c).Request().Context()

	// Anti-IDOR: lookup by id, then scope-check against THIS token's gallery.
	photo, err := h.photoRepo.GetPhotoByID(ctx, (*c).Param("photoId"), "")
	if err != nil {
		return err // unknown photo → repo's 404 not_found
	}
	if photo.ParticipantID != gt.ParticipantID || photo.SessionID != gt.SessionID {
		return apperrors.NotFound("not_found", nil)
	}

	rel := photo.OriginalFileURL
	if (*c).QueryParam("variant") == "framed" && photo.FramedFileURL != "" {
		rel = photo.FramedFileURL
	}
	if rel == "" {
		return apperrors.NotFound("not_found", nil)
	}

	dest := filepath.Join(h.cfg.UploadDir, filepath.FromSlash(rel))
	if !withinDir(h.cfg.UploadDir, dest) {
		return apperrors.NotFound("not_found", nil)
	}
	ext := strings.ToLower(filepath.Ext(dest))
	if strings.EqualFold(ext, ".html") {
		return apperrors.Forbidden("file_type_blocked", nil)
	}
	blob, err := os.ReadFile(dest)
	if err != nil {
		if os.IsNotExist(err) {
			return apperrors.NotFound("not_found", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	ct := safeContentType(ext)
	if ct == "" || !strings.HasPrefix(ct, "image/") {
		return apperrors.Forbidden("file_type_blocked", nil)
	}
	return (*c).Blob(http.StatusOK, ct, blob)
}

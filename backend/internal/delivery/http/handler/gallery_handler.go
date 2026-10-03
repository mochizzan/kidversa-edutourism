package handler

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

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
// token_revoked. Time expiry is NEVER a denial: gallery QR URLs must not
// expire, so an old expires_at (pre-never-expiry mint) does not 410 — only an
// explicit revocation does. It returns (nil, nil) when a
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
	// Deliberately NO time check: the QR on a printed rapor must keep working
	// forever (mint stores a far-future sentinel, and tokens issued before
	// that change are retroactively un-expired here). Revocation semantics
	// are unchanged — a revoked row still answers 410.
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

	resolved, err := resolveReportPhoto(ctx, h.photoRepo, h.sessionRepo, gt.ParticipantID, gt.SessionID, report.ProgramStageID)
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

	// Topics for the parent gallery switcher: the session's session_stages as
	// listed (created_at ASC — CreateSession instantiates them by iterating the
	// program's stages in sequence_order, so listing order IS the topic
	// sequence, the same order GET /api/sessions/:id returns). Display name =
	// the denormalized program_stage_name written at stage creation
	// (CreateSessionStage), so no program_stages join/lookup is needed.
	stages, err := h.sessionRepo.ListSessionStages(ctx, gt.SessionID)
	if err != nil {
		log.Printf("gallery: stage list failed (session=%s): %v", gt.SessionID, err)
		return err
	}
	topics := make([]dto.GalleryTopic, 0, len(stages))
	for i := range stages {
		topics = append(topics, dto.GalleryTopic{
			SessionStageID: stages[i].ID,
			ProgramStageID: stages[i].ProgramStageID,
			Name:           stages[i].ProgramStageName,
		})
	}

	return appresp.OK(c, dto.NewPublicGalleryDTO(report, participant, photos.Items, reportPhotoID, topics))
}

// resolveGalleryPhoto runs the shared gates of the two photo-bytes routes
// (GetPhoto and DownloadPhoto) so they can never drift: gallery token
// validation (resolveGalleryToken), the PHOTO-consent gate
// (requirePhotoConsent), then the anti-IDOR lookup — the photo must belong to
// the token's participant+session (another child's, another session's, a
// deleted row → 404), so a token can never read a gallery it does not own.
// NO byte is served before all three pass. Returns (nil, nil) when a failure
// response was already written — the caller must then return nil immediately;
// (nil, err) means a real error to propagate.
func (h *GalleryHandler) resolveGalleryPhoto(c *echo.Context) (*entity.SmartPhoto, error) {
	gt, err := h.resolveGalleryToken(c)
	if err != nil || gt == nil {
		return nil, err
	}
	if ok, err := h.requirePhotoConsent(c, gt); err != nil || !ok {
		return nil, err
	}
	photo, err := h.photoRepo.GetPhotoByID((*c).Request().Context(), (*c).Param("photoId"), "")
	if err != nil {
		return nil, err // unknown photo → repo's 404 not_found
	}
	if photo.ParticipantID != gt.ParticipantID || photo.SessionID != gt.SessionID {
		return nil, apperrors.NotFound("not_found", nil)
	}
	return photo, nil
}

// serveGalleryPhotoFile is the shared disk path of GetPhoto and
// DownloadPhoto: bytes are read from cfg.UploadDir with the same disk-safety
// pattern as report_handler.GetAccessPhoto (withinDir bounds check, HTML
// refused, image/*-only content type, 404 when the file is missing).
// attachmentName non-empty additionally sets Content-Disposition: attachment
// so the browser SAVES the bytes instead of rendering them inline (the
// download route); empty keeps the inline <img> behavior of GetPhoto. The
// header is set only after the content-type whitelist passed, and the name
// itself is a stored UUID + a whitelisted extension, so its charset is safe.
func (h *GalleryHandler) serveGalleryPhotoFile(c *echo.Context, rel, attachmentName string) error {
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
	if attachmentName != "" {
		(*c).Response().Header().Set("Content-Disposition", `attachment; filename="`+attachmentName+`"`)
	}
	return serveMediaBlob(c, ct, dest, blob)
}

// GetPhoto handles GET /api/reports/gallery/photo/:photoId?token={64hex}&variant=framed|original
// (PUBLIC): serves the raw bytes of ONE gallery photo INLINE for the public
// gallery <img>. The gallery token is the authn; gates live in
// resolveGalleryPhoto, disk safety in serveGalleryPhotoFile.
//
// Path selection: variant=framed → framed_file_url when present, falling back
// to original_file_url; anything else (absent/"original") → original_file_url.
func (h *GalleryHandler) GetPhoto(c *echo.Context) error {
	photo, err := h.resolveGalleryPhoto(c)
	if err != nil || photo == nil {
		return err
	}
	rel := photo.OriginalFileURL
	if (*c).QueryParam("variant") == "framed" && photo.FramedFileURL != "" {
		rel = photo.FramedFileURL
	}
	return h.serveGalleryPhotoFile(c, rel, "")
}

// DownloadPhoto handles GET /api/reports/gallery/photo/:photoId/download?token={64hex}
// (PUBLIC): the fullscreen preview's download button. The gates are IDENTICAL
// to GetPhoto (shared resolveGalleryPhoto — token, consent, anti-IDOR), but
// the path selection is FIXED to original_file_url (NEVER the framed variant)
// and the response carries Content-Disposition: attachment, so the browser
// saves the stored bytes byte-for-byte: written at upload via io.Copy with no
// re-encode and served without any resize/quality parameter → full resolution,
// uncompressed.
func (h *GalleryHandler) DownloadPhoto(c *echo.Context) error {
	photo, err := h.resolveGalleryPhoto(c)
	if err != nil || photo == nil {
		return err
	}
	name := "photo-" + photo.ID + strings.ToLower(filepath.Ext(photo.OriginalFileURL))
	return h.serveGalleryPhotoFile(c, photo.OriginalFileURL, name)
}

package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// MediaHandler serves uploaded media (photos / recordings of children, plus
// decorative frames, stage content, and user avatars) through an authenticated,
// tenant-scoped route. Media is NEVER served via e.Static; every request is
// gated by JWT auth, tenant scope, and (for photos/recordings) a consent log
// check. HTML / SVG content is refused to prevent stored-XSS.
type MediaHandler struct {
	cfg         *config.Config
	photos      repository.PhotoRepository
	recordings  repository.RecordingRepository
	consent     repository.ConsentRepository
	sessions    repository.SessionRepository
	frames      repository.FrameRepository
	contentRepo repository.ContentRepository
	users       repository.UserRepository
}

// NewMediaHandler builds the media handler.
func NewMediaHandler(
	cfg *config.Config,
	photos repository.PhotoRepository,
	recordings repository.RecordingRepository,
	consent repository.ConsentRepository,
	sessions repository.SessionRepository,
	frames repository.FrameRepository,
	contentRepo repository.ContentRepository,
	users repository.UserRepository,
) *MediaHandler {
	return &MediaHandler{cfg: cfg, photos: photos, recordings: recordings, consent: consent, sessions: sessions, frames: frames, contentRepo: contentRepo, users: users}
}

// mediaKind enumerates the served asset kinds.
type mediaKind string

const (
	kindPhoto     mediaKind = "photo"
	kindRecording mediaKind = "recording"
	kindFrame     mediaKind = "frame"
	kindContent   mediaKind = "content"
	kindAvatar    mediaKind = "avatar"
)

// Get handles GET /api/media/:kind/:id.
//   - :kind is "photo", "recording", "frame", "content", or "avatar"; any other
//     value is 400.
//   - :id must be a UUID; otherwise 400.
//   - Requires a valid JWT (enforced by JWTAuth middleware upstream).
//   - Enforces tenant scope: the asset's owning tenant must equal the caller's
//     resolved tenant (from TenantScope middleware).
//   - For photos/recordings, requires a positive ConsentLog value.
//   - Reads the file from disk and streams it with a SAFE content type; refuses
//     to serve .html (or any disallowed type).
func (h *MediaHandler) Get(c *echo.Context) error {
	kind := mediaKind((*c).Param("kind"))
	if kind != kindPhoto && kind != kindRecording && kind != kindFrame && kind != kindContent && kind != kindAvatar {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	id := (*c).Param("id")
	if _, err := uuid.Parse(id); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}

	ctx := (*c).Request().Context()
	callerTenant := appmiddleware.GetTenantID(c)

	var relPath, owningTenant string
	var participantID, sessionID string

	switch kind {
	case kindPhoto:
		rec, err := h.photos.GetByID(ctx, id, "")
		if err != nil {
			return err
		}
		relPath = rec.OriginalFileURL
		sessionID = rec.SessionID
		participantID = rec.ParticipantID
		ot, oerr := h.sessions.TenantIDForSession(ctx, rec.SessionID)
		if oerr != nil {
			return oerr
		}
		owningTenant = ot
		// Consent gating: photo of a child requires positive PHOTO consent.
		granted, cerr := h.consent.GetValue(ctx, participantID, sessionID, entity.ConsentPhoto)
		if cerr != nil {
			return cerr
		}
		if !granted {
			return appresp.Fail(c, http.StatusForbidden, "consent_required")
		}
	case kindRecording:
		rec, err := h.recordings.GetByID(ctx, id, "")
		if err != nil {
			return err
		}
		relPath = rec.FileURL
		sessionID = rec.SessionID
		participantID = rec.ParticipantID
		ot, oerr := h.sessions.TenantIDForSession(ctx, rec.SessionID)
		if oerr != nil {
			return oerr
		}
		owningTenant = ot
		// Consent gating: recording of a child requires positive RECORDING consent.
		granted, cerr := h.consent.GetValue(ctx, participantID, sessionID, entity.ConsentRecording)
		if cerr != nil {
			return cerr
		}
		if !granted {
			return appresp.Fail(c, http.StatusForbidden, "consent_required")
		}
	case kindFrame:
		// Frames are decorative overlays; no consent gate. Tenant scope is
		// enforced via the frame's stored tenant_id.
		rec, err := h.frames.GetByID(ctx, id, "")
		if err != nil {
			return err
		}
		relPath = rec.FileURL
		owningTenant = rec.TenantID
	case kindContent:
		// Stage content is curriculum media; no consent gate. Tenant scope is
		// resolved through the content's owning stage's program (CRIT-6).
		ct, err := h.contentRepo.GetContentByID(ctx, id)
		if err != nil {
			return err
		}
		relPath = ct.FileURL
		owningTenant, terr := h.contentRepo.GetContentProgramTenant(ctx, id)
		if terr != nil {
			return terr
		}
		// Unassigned content (no stage) has no tenant to scope -> not playable.
		if owningTenant == "" {
			return appresp.Fail(c, http.StatusNotFound, "not_found")
		}
	case kindAvatar:
		// Avatars are user profile images; tenant scope via the user's tenant.
		u, err := h.users.GetByID(ctx, id)
		if err != nil {
			return err
		}
		relPath = u.AvatarURL
		owningTenant = derefTenant(u.TenantID)
	}

	if relPath == "" {
		return appresp.Fail(c, http.StatusNotFound, "not_found")
	}

	// Tenant scope check.
	if owningTenant != callerTenant {
		return appresp.Fail(c, http.StatusForbidden, "forbidden")
	}

	// Resolve + bounds-check the on-disk path.
	dest := filepath.Join(h.cfg.UploadDir, filepath.FromSlash(relPath))
	if !withinDir(h.cfg.UploadDir, dest) {
		return appresp.Fail(c, http.StatusNotFound, "not_found")
	}

	// Refuse HTML outright (stored-XSS) regardless of how it got on disk.
	if strings.EqualFold(filepath.Ext(dest), ".html") {
		return appresp.Fail(c, http.StatusForbidden, "file_type_blocked")
	}

	data, err := os.ReadFile(dest)
	if err != nil {
		if os.IsNotExist(err) {
			return appresp.Fail(c, http.StatusNotFound, "not_found")
		}
		return appresp.Fail(c, http.StatusInternalServerError, "internal_error")
	}

	ct := safeContentType(filepath.Ext(dest))
	if ct == "" {
		// Unknown/unsafe extension — don't serve with an inferred type.
		return appresp.Fail(c, http.StatusForbidden, "file_type_blocked")
	}
	return (*c).Blob(http.StatusOK, ct, data)
}

// GetContent serves stage content files without authentication — used by the
// public learner kiosk where no JWT is available. Only content files are
// served; photos, recordings, frames, and avatars remain JWT-gated.
func (h *MediaHandler) GetContent(c *echo.Context) error {
	id := (*c).Param("id")
	if _, err := uuid.Parse(id); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}

	ct, err := h.contentRepo.GetContentByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	relPath := ct.FileURL
	if relPath == "" {
		return appresp.Fail(c, http.StatusNotFound, "not_found")
	}

	dest := filepath.Join(h.cfg.UploadDir, filepath.FromSlash(relPath))
	if !withinDir(h.cfg.UploadDir, dest) {
		return appresp.Fail(c, http.StatusNotFound, "not_found")
	}
	if strings.EqualFold(filepath.Ext(dest), ".html") {
		return appresp.Fail(c, http.StatusForbidden, "file_type_blocked")
	}

	data, err := os.ReadFile(dest)
	if err != nil {
		if os.IsNotExist(err) {
			return appresp.Fail(c, http.StatusNotFound, "not_found")
		}
		return appresp.Fail(c, http.StatusInternalServerError, "internal_error")
	}

	safeCt := safeContentType(filepath.Ext(dest))
	if safeCt == "" {
		return appresp.Fail(c, http.StatusForbidden, "file_type_blocked")
	}
	return (*c).Blob(http.StatusOK, safeCt, data)
}

// derefTenant normalizes a nullable tenant pointer into an empty-or-value string.
func derefTenant(tid *string) string {
	if tid == nil {
		return ""
	}
	return *tid
}

// safeContentType maps a file extension to a safe content type, returning ""
// for types we refuse to serve (HTML, SVG, executables, etc.).
func safeContentType(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".mp3":
		return "audio/mpeg"
	case ".wav":
		return "audio/wav"
	case ".ogg":
		return "audio/ogg"
	case ".aac":
		return "audio/aac"
	case ".m4a":
		return "audio/mp4"
	case ".webm":
		return "video/webm"
	case ".mp4", ".m4v":
		return "video/mp4"
	default:
		return ""
	}
}

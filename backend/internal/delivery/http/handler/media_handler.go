package handler

import (
	"fmt"
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

// MediaHandler serves uploaded media (photos of children, plus decorative
// frames, stage content, and user avatars) through an authenticated,
// tenant-scoped route. Media is NEVER served via e.Static; every request is
// gated by JWT auth, tenant scope, and (for photos) a consent log check.
// HTML / SVG content is refused to prevent stored-XSS.
type MediaHandler struct {
	cfg         *config.Config
	photos      repository.PhotoRepository
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
	consent repository.ConsentRepository,
	sessions repository.SessionRepository,
	frames repository.FrameRepository,
	contentRepo repository.ContentRepository,
	users repository.UserRepository,
) *MediaHandler {
	return &MediaHandler{cfg: cfg, photos: photos, consent: consent, sessions: sessions, frames: frames, contentRepo: contentRepo, users: users}
}

// mediaKind enumerates the served asset kinds.
type mediaKind string

const (
	kindPhoto   mediaKind = "photo"
	kindFrame   mediaKind = "frame"
	kindContent mediaKind = "content"
	kindAvatar  mediaKind = "avatar"
)

// Get handles GET /api/media/:kind/:id.
//   - :kind is "photo", "frame", "content", or "avatar"; any other value is 400.
//   - :id must be a UUID; otherwise 400.
//   - Requires a valid JWT (enforced by JWTAuth middleware upstream).
//   - Enforces tenant scope: the asset's owning tenant must equal the caller's
//     resolved tenant (from TenantScope middleware).
//   - For photos, requires a positive ConsentLog value.
//   - Reads the file from disk and streams it with a SAFE content type; refuses
//     to serve .html (or any disallowed type).
func (h *MediaHandler) Get(c *echo.Context) error {
	kind := mediaKind((*c).Param("kind"))
	if kind != kindPhoto && kind != kindFrame && kind != kindContent && kind != kindAvatar {
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
		rec, err := h.photos.GetPhotoByID(ctx, id, "")
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
		granted, cerr := h.consent.GetConsentValue(ctx, participantID, sessionID, entity.ConsentPhoto)
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
		// Stage content is curriculum media; no consent gate. Tenant scope
		// comes primarily from the content row's own tenant_id (stamped at
		// upload) — standalone assets such as badge images are never assigned
		// to a stage. Legacy rows without a row tenant fall back to the owning
		// stage's program (CRIT-6): unassigned + unscoped content stays unservable.
		ct, err := h.contentRepo.GetContentByID(ctx, id)
		if err != nil {
			return err
		}
		relPath = ct.FileURL
		owningTenant = ct.TenantID
		if owningTenant == "" {
			pt, terr := h.contentRepo.GetContentProgramTenant(ctx, id)
			if terr != nil {
				return terr
			}
			owningTenant = pt
		}
		// Unassigned content (no stage) and no row tenant has no tenant to
		// scope -> not playable.
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
	return serveMediaBlob(c, ct, dest, data)
}

// fileETag derives a strong ETag for a file from its mtime and size — a single
// os.Stat, never a hash of the bytes. Sufficient here because every stored
// path uses a random filename minted at upload: the path's identity is stable
// while the bytes behind it can change (content replace, avatar swap). When
// stat fails, ok=false so callers degrade to an unconditional 200 instead of
// erroring.
func fileETag(path string) (etag string, ok bool) {
	fi, err := os.Stat(path)
	if err != nil {
		return "", false
	}
	return fmt.Sprintf("\"%x-%x\"", fi.ModTime().UnixNano(), fi.Size()), true
}

// ifNoneMatch reports whether an If-None-Match header value matches etag:
// comma-separated candidates, exact match, weak "W/" prefix tolerated
// (If-None-Match uses the weak comparison function), and "*" (any current
// representation). An empty header never matches.
func ifNoneMatch(header, etag string) bool {
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if candidate == "*" || candidate == etag {
			return true
		}
		if strings.HasPrefix(candidate, "W/") && strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}

// serveMediaBlob is the shared raw-byte response path of the three media
// endpoints (MediaHandler.Get, GalleryHandler.GetPhoto,
// ReportHandler.GetAccessPhoto — same package): Cache-Control: no-cache on
// EVERY response (200 and 304), an ETag from file mtime+size when stat
// succeeds, a bodiless 304 carrying only the caching headers when the
// request's If-None-Match matches, otherwise 200 + body + ETag. A failed stat
// degrades to the plain 200 (no ETag, no 304) — never an error.
func serveMediaBlob(c *echo.Context, contentType, path string, data []byte) error {
	h := (*c).Response().Header()
	h.Set("Cache-Control", "no-cache")
	if etag, ok := fileETag(path); ok {
		h.Set("ETag", etag)
		if ifNoneMatch((*c).Request().Header.Get("If-None-Match"), etag) {
			return (*c).NoContent(http.StatusNotModified)
		}
	}
	return (*c).Blob(http.StatusOK, contentType, data)
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

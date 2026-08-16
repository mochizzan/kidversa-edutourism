package handler

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	apputil "kidversa-edutourism-backend/internal/pkg/util"
)

// UploadHandler serves the multipart file-upload endpoints that persist media
// to disk (under cfg.UploadDir) and create the corresponding SmartPhoto /
// Recording / PhotoFrame / StageContent records (or patch a User's avatar).
// Served media is later retrieved via the authenticated media handler (never
// e.Static).
type UploadHandler struct {
	cfg         *config.Config
	photos      repository.PhotoRepository
	recordings  repository.RecordingRepository
	frames      repository.FrameRepository
	contentRepo repository.ContentRepository
	users       repository.UserRepository
	consent     repository.ConsentRepository
}

// NewUploadHandler builds the upload handler.
func NewUploadHandler(
	cfg *config.Config,
	photos repository.PhotoRepository,
	recordings repository.RecordingRepository,
	frames repository.FrameRepository,
	contentRepo repository.ContentRepository,
	users repository.UserRepository,
	consent repository.ConsentRepository,
) *UploadHandler {
	return &UploadHandler{cfg: cfg, photos: photos, recordings: recordings, frames: frames, contentRepo: contentRepo, users: users, consent: consent}
}

const uploadFieldName = "file"

// UploadPhoto handles POST /api/photos/upload:
//   - validates + stores the multipart file to disk (random name, extension
//     derived from verified magic bytes — never from the client filename),
//   - creates a SmartPhoto row referencing the stored file,
//   - returns the created record.
func (h *UploadHandler) UploadPhoto(c *echo.Context) error {
	// Read IDs first; participant_id is required and must be present before any
	// consent lookup or file persist.
	participantID := (*c).FormValue("participant_id")
	if participantID == "" {
		return appresp.FailMsg(c, http.StatusBadRequest, "validation_error", "participant_id wajib diisi")
	}
	sessionID := (*c).FormValue("session_id")

	// Consent gate: check BEFORE persisting the file so a denied upload never
	// writes an orphan to disk (E3.4). Consent is read fresh from the DB per
	// request (E3.7); a client flag is NEVER trusted (E3.1).
	ctx := (*c).Request().Context()
	granted, cerr := h.consent.GetConsentValue(ctx, participantID, sessionID, entity.ConsentPhoto)
	if cerr != nil {
		return appresp.Fail(c, http.StatusInternalServerError, "internal_error")
	}
	if !granted {
		return appresp.Fail(c, http.StatusForbidden, "consent_required")
	}

	_, storedRel, err := h.persistFile(c, "photos")
	if err != nil {
		return err
	}

	userID := appmiddleware.GetUserID(c)
	takenBy := (*c).FormValue("taken_by")
	if takenBy == "" {
		takenBy = userID
	}
	takenAtStr := (*c).FormValue("taken_at")
	var takenAt time.Time
	if t, ok := apputil.ParseISO(takenAtStr); ok {
		takenAt = t
	} else {
		takenAt = apputil.Now()
	}
	isReport := (*c).FormValue("is_report_photo") == "true" || (*c).FormValue("is_report_photo") == "1"

	rec := &entity.SmartPhoto{
		BaseModel:       entity.BaseModel{ID: uuid.NewString()},
		ParticipantID:   (*c).FormValue("participant_id"),
		SessionID:       (*c).FormValue("session_id"),
		FrameID:         (*c).FormValue("frame_id"),
		OriginalFileURL: storedRel,
		IsReportPhoto:   isReport,
		TakenBy:         takenBy,
		TakenAt:         takenAt,
		SyncStatus:      entity.SyncLocal,
	}
	if err := h.photos.CreatePhoto((*c).Request().Context(), rec); err != nil {
		// Roll back the stored file so we don't leave orphans.
		if rmErr := h.removeStored(h.cfg.UploadDir, storedRel); rmErr != nil {
			// Log cleanup failure but don't change the return value.
			log.Printf("upload: failed to remove orphan file %s: %v", storedRel, rmErr)
		}
		return err
	}
	return appresp.Created(c, rec)
}

// UploadRecording handles POST /api/recordings/upload (same contract as photos,
// for audio/video). Creates a Recording row referencing the stored file.
func (h *UploadHandler) UploadRecording(c *echo.Context) error {
	fileSize, storedRel, err := h.persistFile(c, "recordings")
	if err != nil {
		return err
	}

	reviewedBy := (*c).FormValue("reviewed_by")
	var reviewedByPtr *string
	if reviewedBy != "" {
		reviewedByPtr = &reviewedBy
	}

	duration := 0
	if v := (*c).FormValue("duration_seconds"); v != "" {
		if n, e := strconv.Atoi(strings.TrimSpace(v)); e == nil {
			duration = n
		}
	}

	rec := &entity.Recording{
		BaseModel:       entity.BaseModel{ID: uuid.NewString()},
		ParticipantID:   (*c).FormValue("participant_id"),
		SessionID:       (*c).FormValue("session_id"),
		SessionStageID:  (*c).FormValue("session_stage_id"),
		FileURL:         storedRel,
		DurationSeconds: duration,
		FileSizeBytes:   fileSize,
		TranscriptText:  (*c).FormValue("transcript_text"),
		ReviewStatus:    entity.RecordingPending,
		ReviewedBy:      reviewedByPtr,
		SyncStatus:      entity.SyncLocal,
	}
	if err := h.recordings.CreateRecording((*c).Request().Context(), rec); err != nil {
		// Roll back the stored file so we don't leave orphans.
		if rmErr := h.removeStored(h.cfg.UploadDir, storedRel); rmErr != nil {
			log.Printf("upload: failed to remove orphan file %s: %v", storedRel, rmErr)
		}
		return err
	}
	return appresp.Created(c, rec)
}

// UploadFrame handles POST /api/frames/upload:
//   - validates + stores the multipart file to disk (subdir "frames"),
//   - creates a PhotoFrame row referencing the stored file.
//
// The frame's owning tenant is derived from the JWT/scope (never the body, F5).
// program_id is optional; name is required.
func (h *UploadHandler) UploadFrame(c *echo.Context) error {
	_, storedRel, err := h.persistFile(c, "frames")
	if err != nil {
		return err
	}

	name := (*c).FormValue("name")
	if name == "" {
		_ = h.removeStored(h.cfg.UploadDir, storedRel)
		return appresp.FailMsg(c, http.StatusBadRequest, "validation_error", "Nama frame wajib diisi")
	}

	tenantID := appmiddleware.GetTenantID(c)
	f := &entity.PhotoFrame{
		TenantID:  tenantID,
		ProgramID: (*c).FormValue("program_id"),
		Name:      name,
		FileURL:   storedRel,
		IsActive:  true,
		SortOrder: 0,
	}
	if v := (*c).FormValue("sort_order"); v != "" {
		if n, e := strconv.Atoi(strings.TrimSpace(v)); e == nil {
			f.SortOrder = n
		}
	}
	if err := h.frames.Create((*c).Request().Context(), f); err != nil {
		// Roll back the stored file so we don't leave orphans.
		if rmErr := h.removeStored(h.cfg.UploadDir, storedRel); rmErr != nil {
			log.Printf("upload: failed to remove orphan file %s: %v", storedRel, rmErr)
		}
		return err
	}
	return appresp.Created(c, dto.NewFrameResponse(f))
}

// UploadContentFile handles POST /api/contents/upload (content-level, Model A):
//   - validates + stores the multipart file to disk (subdir "contents"),
//   - creates a standalone Content row referencing the stored file (tenant-scoped),
//   - the caller then assigns it to a stage via POST /api/programs/program-stages/:stageId/contents/assign.
//
// tenant scoping is enforced via the JWT/scope (never the body, F5). file_type is required.
func (h *UploadHandler) UploadContentFile(c *echo.Context) error {
	_, storedRel, err := h.persistFile(c, "contents")
	if err != nil {
		return err
	}

	title := (*c).FormValue("title")
	if title == "" {
		title = (*c).FormValue("name")
	}
	fileType := entity.StageContentFileType((*c).FormValue("file_type"))
	if fileType == "" {
		_ = removeStored(h.cfg.UploadDir, storedRel)
		return appresp.FailMsg(c, http.StatusBadRequest, "validation_error", "Tipe file konten wajib diisi")
	}

	tenantID := appmiddleware.GetTenantID(c)

	ct := &entity.Content{
		TenantID: tenantID,
		Title:    title,
		FileURL:  storedRel,
		FileType: fileType,
	}
	if v := (*c).FormValue("duration_seconds"); v != "" {
		if n, e := strconv.Atoi(strings.TrimSpace(v)); e == nil {
			ct.DurationSeconds = n
		}
	}
	// For uploaded VIDEO, recompute the duration authoritatively from the stored
	// file with ffprobe (the client value above is only a fallback). Non-positive
	// results are ignored so a missing ffprobe binary never wipes a good estimate.
	if fileType == entity.StageContentVideo {
		if probed := apputil.ProbeVideoDuration(filepath.Join(h.cfg.UploadDir, filepath.FromSlash(storedRel))); probed > 0 {
			ct.DurationSeconds = probed
		}
	}
	if err := h.contentRepo.CreateContent((*c).Request().Context(), ct); err != nil {
		// Roll back the stored file so we don't leave orphans.
		if rmErr := removeStored(h.cfg.UploadDir, storedRel); rmErr != nil {
			log.Printf("upload: failed to remove orphan file %s: %v", storedRel, rmErr)
		}
		return err
	}
	return appresp.Created(c, ct)
}

// ReplaceContentFile handles POST /api/contents/:id/replace-file:
//   - validates + stores the NEW multipart file to disk (subdir "contents"),
//   - replaces the existing Content's FileURL in place (same Content ID, so all
//     stage assignments stay intact), resets YouTubeURL, optionally updates
//     Title/FileType, re-probes VIDEO duration from the new file,
//   - then deletes the OLD stored file.
//
// Tenant scoping is enforced: a content may only be replaced by its owning
// tenant (SUPER_ADMIN is exempt, consistent with the scope middleware).
func (h *UploadHandler) ReplaceContentFile(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ct, err := h.contentRepo.GetContentByID((*c).Request().Context(), id)
	if err != nil {
		return err
	}

	// Tenant guard: only the owning tenant (or SUPER_ADMIN) may replace.
	actorRole, _ := (*c).Get(appmiddleware.CtxRole).(string)
	if actorRole != string(entity.RoleSuperAdmin) {
		if ct.TenantID != appmiddleware.GetTenantID(c) {
			return appresp.Fail(c, http.StatusForbidden, "forbidden")
		}
	}

	oldFileURL := ct.FileURL

	_, storedRel, err := h.persistFile(c, "contents")
	if err != nil {
		return err
	}

	// Optional metadata overrides; missing fields keep their current value.
	if v := (*c).FormValue("title"); v != "" {
		ct.Title = v
	}
	if v := entity.StageContentFileType((*c).FormValue("file_type")); v != "" {
		ct.FileType = v
	}
	ct.FileURL = storedRel
	// Replacing with an uploaded file clears any prior YouTube source.
	ct.YouTubeURL = ""

	// Duration: prefer the authoritative ffprobe of the new VIDEO file; else an
	// explicit form value; else keep the existing value.
	duration := ct.DurationSeconds
	if v := (*c).FormValue("duration_seconds"); v != "" {
		if n, e := strconv.Atoi(strings.TrimSpace(v)); e == nil {
			duration = n
		}
	}
	if ct.FileType == entity.StageContentVideo {
		if probed := apputil.ProbeVideoDuration(filepath.Join(h.cfg.UploadDir, filepath.FromSlash(storedRel))); probed > 0 {
			duration = probed
		}
	}
	ct.DurationSeconds = duration

	if err := h.contentRepo.UpdateContent((*c).Request().Context(), ct); err != nil {
		// Roll back the newly stored file so we don't leave orphans; the old file stays.
		if rmErr := h.removeStored(h.cfg.UploadDir, storedRel); rmErr != nil {
			log.Printf("upload: failed to remove orphan file %s: %v", storedRel, rmErr)
		}
		return err
	}
	// Remove the old file only after the row update succeeded.
	if oldFileURL != "" && oldFileURL != storedRel {
		if rmErr := h.removeStored(h.cfg.UploadDir, oldFileURL); rmErr != nil {
			log.Printf("upload: failed to remove old content file %s: %v", oldFileURL, rmErr)
		}
	}
	return appresp.Created(c, ct)
}

// UploadAvatar handles POST /api/users/:id/avatar:
//   - validates + stores the multipart file to disk (subdir "avatars"),
//   - updates the user's avatar_url to the stored path.
//
// Tenant scoping for the target user is enforced by the user repository's
// Update path (same-tenant / SUPER_ADMIN). The file is stored as a path, never
// a base64 blob, to keep the VARCHAR column small.
func (h *UploadHandler) UploadAvatar(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}

	// Scope guard: only the target user themselves, or an admin/koordinator/
	// super_admin (the admin "edit user" flow), may set the avatar. A facilitator
	// uploading someone else's avatar is rejected.
	actorID := appmiddleware.GetUserID(c)
	actorRole, _ := (*c).Get(appmiddleware.CtxRole).(string)
	if id != actorID && actorRole != string(entity.RoleSuperAdmin) && actorRole != string(entity.RoleAdmin) && actorRole != string(entity.RoleKoordinator) {
		return appresp.Fail(c, http.StatusForbidden, "forbidden")
	}

	_, storedRel, err := h.persistFile(c, "avatars")
	if err != nil {
		return err
	}

	user, err := h.users.GetByID((*c).Request().Context(), id)
	if err != nil {
		// Roll back the stored file so we don't leave orphans.
		if rmErr := h.removeStored(h.cfg.UploadDir, storedRel); rmErr != nil {
			log.Printf("upload: failed to remove orphan file %s: %v", storedRel, rmErr)
		}
		return err
	}
	user.AvatarURL = storedRel
	if err := h.users.Update((*c).Request().Context(), user); err != nil {
		// Roll back the stored file so we don't leave orphans.
		if rmErr := h.removeStored(h.cfg.UploadDir, storedRel); rmErr != nil {
			log.Printf("upload: failed to remove orphan file %s: %v", storedRel, rmErr)
		}
		return err
	}
	return appresp.OK(c, user)
}

// persistFile validates, sniffs, and stores the uploaded file into a subdir of
// cfg.UploadDir using a random filename. It returns the file size (from the
// multipart header) and the stored path RELATIVE to cfg.UploadDir. The
// client-supplied filename is ignored entirely (path-traversal hardening).
func (h *UploadHandler) persistFile(c *echo.Context, subdir string) (int64, string, error) {
	fh, err := (*c).FormFile(uploadFieldName)
	if err != nil {
		return 0, "", appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	src, err := fh.Open()
	if err != nil {
		return 0, "", apperrors.Internal("internal_error", err)
	}
	defer src.Close()

	// Read a sniff window first, then the rest.
	head := make([]byte, 512)
	n, err := io.ReadFull(src, head)
	if err != nil && err != io.ErrUnexpectedEOF {
		if err == io.EOF {
			return 0, "", appresp.FailMsg(c, http.StatusBadRequest, "invalid_file", "file kosong")
		}
		return 0, "", apperrors.Internal("internal_error", err)
	}
	head = head[:n]

	detected, ok := detectAllowedMedia(head)
	if !ok {
		return 0, "", appresp.FailMsg(c, http.StatusUnsupportedMediaType, "file_type_unsupported", "Tipe berkas tidak diizinkan")
	}

	// Compose the random destination name (uuid + detected extension).
	rand := uuid.NewString()
	rel := filepath.ToSlash(filepath.Join(subdir, rand+detected.ext))
	dest := filepath.Join(h.cfg.UploadDir, filepath.FromSlash(rel))

	// Double-check the resolved destination stays inside UploadDir.
	if !withinDir(h.cfg.UploadDir, dest) {
		return 0, "", apperrors.Internal("internal_error", nil)
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o750); err != nil {
		return 0, "", apperrors.Internal("internal_error", err)
	}

	out, err := os.Create(dest)
	if err != nil {
		return 0, "", apperrors.Internal("internal_error", err)
	}
	defer out.Close()

	if _, err := out.Write(head); err != nil {
		_ = os.Remove(dest)
		return 0, "", apperrors.Internal("internal_error", err)
	}
	if _, err := io.Copy(out, src); err != nil {
		_ = os.Remove(dest)
		return 0, "", apperrors.Internal("internal_error", err)
	}
	return fh.Size, rel, nil
}

// removeStored deletes a previously stored upload (rollback helper). Free
// function so it is reusable across handlers (e.g. ContentHandler.Delete).
func removeStored(uploadDir, rel string) error {
	dest := filepath.Join(uploadDir, filepath.FromSlash(rel))
	if !withinDir(uploadDir, dest) {
		return nil
	}
	return os.Remove(dest)
}

// removeStored (method form) delegates to the free function above.
func (h *UploadHandler) removeStored(uploadDir, rel string) error {
	return removeStored(uploadDir, rel)
}

// --- media type detection (extension + magic bytes) ---

type detectedMedia struct {
	ext  string // includes leading dot
	ct   string // safe content-type for serving
	kind string // "image" | "audio" | "video"
}

// allowedMedia maps magic-byte signatures to a safe extension + content type.
// IMPORTANT: HTML / SVG / executable types are intentionally absent — they can
// carry stored-XSS and are never produced here, so uploads of such files are
// rejected outright.
func detectAllowedMedia(head []byte) (detectedMedia, bool) {
	switch {
	case len(head) >= 3 && bytes.Equal(head[:3], []byte{0xFF, 0xD8, 0xFF}):
		return detectedMedia{".jpg", "image/jpeg", "image"}, true
	case len(head) >= 8 && bytes.Equal(head[:8], []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'}):
		return detectedMedia{".png", "image/png", "image"}, true
	case len(head) >= 6 && bytes.Equal(head[:6], []byte("GIF87a")), len(head) >= 6 && bytes.Equal(head[:6], []byte("GIF89a")):
		return detectedMedia{".gif", "image/gif", "image"}, true
	case len(head) >= 12 && bytes.Equal(head[:4], []byte("RIFF")) && bytes.Equal(head[8:12], []byte("WEBP")):
		return detectedMedia{".webp", "image/webp", "image"}, true
	case len(head) >= 3 && bytes.Equal(head[:3], []byte("ID3")):
		return detectedMedia{".mp3", "audio/mpeg", "audio"}, true
	case len(head) >= 2 && (bytes.Equal(head[:2], []byte{0xFF, 0xFB}) || bytes.Equal(head[:2], []byte{0xFF, 0xF3}) || bytes.Equal(head[:2], []byte{0xFF, 0xF2})):
		return detectedMedia{".mp3", "audio/mpeg", "audio"}, true
	case len(head) >= 12 && bytes.Equal(head[:4], []byte("RIFF")) && bytes.Equal(head[8:12], []byte("WAVE")):
		return detectedMedia{".wav", "audio/wav", "audio"}, true
	case len(head) >= 4 && bytes.Equal(head[:4], []byte("OggS")):
		return detectedMedia{".ogg", "audio/ogg", "audio"}, true
	case len(head) >= 4 && bytes.Equal(head[:4], []byte{0x1A, 0x45, 0xDF, 0xA3}):
		return detectedMedia{".webm", "video/webm", "video"}, true
	case len(head) >= 12 && bytes.Equal(head[4:8], []byte("ftyp")):
		// MP4 family (mp4, m4a, mov). Major brand at bytes 8-12 distinguishes, but
		// all are served as video/mp4 for safety.
		major := string(head[8:12])
		switch {
		case strings.HasPrefix(major, "M4A"), strings.HasPrefix(major, "M4B"):
			return detectedMedia{".m4a", "audio/mp4", "audio"}, true
		default:
			return detectedMedia{".mp4", "video/mp4", "video"}, true
		}
	case len(head) >= 2 && (bytes.Equal(head[:2], []byte{0xFF, 0xF1}) || bytes.Equal(head[:2], []byte{0xFF, 0xF9}) || bytes.Equal(head[:2], []byte{0xFF, 0xF0})):
		// ADTS AAC.
		return detectedMedia{".aac", "audio/aac", "audio"}, true
	default:
		return detectedMedia{}, false
	}
}

// withinDir reports whether path p resolves to a location inside dir.
func withinDir(dir, p string) bool {
	cleanDir := filepath.Clean(dir)
	cleanP := filepath.Clean(p)
	if cleanDir == "." {
		cleanDir = ""
	}
	rel, err := filepath.Rel(cleanDir, cleanP)
	if err != nil {
		return false
	}
	return !strings.Contains(rel, "..") && rel != ".."
}

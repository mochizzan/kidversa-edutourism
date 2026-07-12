package handler

import (
	"bytes"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"

	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// UploadHandler serves the multipart file-upload endpoints that persist media
// to disk (under cfg.UploadDir) and create the corresponding SmartPhoto /
// Recording records. Served media is later retrieved via the authenticated
// media handler (never e.Static).
type UploadHandler struct {
	cfg           *config.Config
	photos        repository.PhotoRepository
	recordings    repository.RecordingRepository
}

// NewUploadHandler builds the upload handler.
func NewUploadHandler(cfg *config.Config, photos repository.PhotoRepository, recordings repository.RecordingRepository) *UploadHandler {
	return &UploadHandler{cfg: cfg, photos: photos, recordings: recordings}
}

const uploadFieldName = "file"

// UploadPhoto handles POST /api/photos/upload:
//   - validates + stores the multipart file to disk (random name, extension
//     derived from verified magic bytes — never from the client filename),
//   - creates a SmartPhoto row referencing the stored file,
//   - returns the created record.
func (h *UploadHandler) UploadPhoto(c *echo.Context) error {
	_, storedRel, err := h.persistFile(c, "photos")
	if err != nil {
		return err
	}

	userID := appmiddleware.GetUserID(c)
	takenBy := (*c).FormValue("taken_by")
	if takenBy == "" {
		takenBy = userID
	}
	takenAt := (*c).FormValue("taken_at")
	if takenAt == "" {
		takenAt = time.Now().Format(time.RFC3339)
	}
	isReport := (*c).FormValue("is_report_photo") == "true" || (*c).FormValue("is_report_photo") == "1"

	rec := &entity.SmartPhoto{
		BaseModel:      entity.BaseModel{ID: uuid.NewString()},
		ParticipantID:  (*c).FormValue("participant_id"),
		SessionID:      (*c).FormValue("session_id"),
		FrameID:        (*c).FormValue("frame_id"),
		OriginalFileURL: storedRel,
		IsReportPhoto:  isReport,
		TakenBy:        takenBy,
		TakenAt:        takenAt,
		SyncStatus:     entity.SyncLocal,
	}
	if err := h.photos.Create((*c).Request().Context(), rec); err != nil {
		// Roll back the stored file so we don't leave orphans.
		_ = h.removeStored(h.cfg.UploadDir, storedRel)
		return err
	}
	return appresp.Created(c, rec)
}

// UploadRecording handles POST /api/recordings/upload (same contract as photos,
// for audio/video). Creates a Recording row referencing the stored file.
func (h *UploadHandler) UploadRecording(c *echo.Context) error {
	fh, storedRel, err := h.persistFile(c, "recordings")
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
		if n, e := parsePositiveInt(v); e == nil {
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
		FileSizeBytes:   fh.Size,
		TranscriptText:  (*c).FormValue("transcript_text"),
		ReviewStatus:    entity.RecordingPending,
		ReviewedBy:      reviewedByPtr,
		SyncStatus:      entity.SyncLocal,
	}
	if err := h.recordings.Create((*c).Request().Context(), rec); err != nil {
		_ = h.removeStored(h.cfg.UploadDir, storedRel)
		return err
	}
	return appresp.Created(c, rec)
}

// persistFile validates, sniffs, and stores the uploaded file into a subdir of
// cfg.UploadDir using a random filename. It returns the multipart header (for
// size) and the stored path RELATIVE to cfg.UploadDir. The client-supplied
// filename is ignored entirely (path-traversal hardening).
func (h *UploadHandler) persistFile(c *echo.Context, subdir string) (*multipartHeader, string, error) {
	fh, err := (*c).FormFile(uploadFieldName)
	if err != nil {
		return nil, "", appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	src, err := fh.Open()
	if err != nil {
		return nil, "", apperrors.Internal("internal_error", err)
	}
	defer src.Close()

	// Read a sniff window first, then the rest.
	head := make([]byte, 512)
	n, err := io.ReadFull(src, head)
	if err != nil && err != io.ErrUnexpectedEOF {
		if err == io.EOF {
			return nil, "", appresp.FailMsg(c, http.StatusBadRequest, "invalid_file", "file kosong")
		}
		return nil, "", apperrors.Internal("internal_error", err)
	}
	head = head[:n]

	detected, ok := detectAllowedMedia(head)
	if !ok {
		return nil, "", appresp.FailMsg(c, http.StatusUnsupportedMediaType, "file_type_unsupported", "Tipe berkas tidak diizinkan")
	}

	// Compose the random destination name (uuid + detected extension).
	rand := uuid.NewString()
	rel := filepath.ToSlash(filepath.Join(subdir, rand+detected.ext))
	dest := filepath.Join(h.cfg.UploadDir, filepath.FromSlash(rel))

	// Double-check the resolved destination stays inside UploadDir.
	if !withinDir(h.cfg.UploadDir, dest) {
		return nil, "", apperrors.Internal("internal_error", nil)
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o750); err != nil {
		return nil, "", apperrors.Internal("internal_error", err)
	}

	out, err := os.Create(dest)
	if err != nil {
		return nil, "", apperrors.Internal("internal_error", err)
	}
	defer out.Close()

	if _, err := out.Write(head); err != nil {
		_ = os.Remove(dest)
		return nil, "", apperrors.Internal("internal_error", err)
	}
	if _, err := io.Copy(out, src); err != nil {
		_ = os.Remove(dest)
		return nil, "", apperrors.Internal("internal_error", err)
	}
	return &multipartHeader{Size: fh.Size}, rel, nil
}

// removeStored deletes a previously stored upload (rollback helper).
func (h *UploadHandler) removeStored(uploadDir, rel string) error {
	dest := filepath.Join(uploadDir, filepath.FromSlash(rel))
	if !withinDir(uploadDir, dest) {
		return nil
	}
	return os.Remove(dest)
}

// multipartHeader is a thin alias so we don't import multipart in the signature.
type multipartHeader struct {
	Size int64
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

// parsePositiveInt parses a non-negative integer from a form value.
func parsePositiveInt(s string) (int, error) {
	return strconv.Atoi(strings.TrimSpace(s))
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

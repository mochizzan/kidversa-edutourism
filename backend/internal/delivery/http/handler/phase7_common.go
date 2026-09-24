package handler

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/pkg/constants"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// resolveReportPhoto returns the photo backing a report for one participant,
// session and topic (program stage). An explicit report_photo_picks row wins;
// when no pick row exists the session's exclusive is_report_photo default is
// the fallback. A pick whose photo was deleted resolves to (nil, nil) — no
// fallback, no dangling reference (spec §1 + §5.1; see plan R2).
func resolveReportPhoto(ctx context.Context, photos repository.PhotoRepository,
	participantID, sessionID, programStageID string) (*entity.SmartPhoto, error) {
	pick, err := photos.GetReportPhotoPick(ctx, participantID, sessionID, programStageID)
	if err != nil {
		return nil, err
	}
	if pick != nil {
		rec, err := photos.GetPhotoByID(ctx, pick.PhotoID, "")
		if err != nil {
			var ae *apperrors.AppError
			if errors.As(err, &ae) && ae.Status == http.StatusNotFound {
				return nil, nil // pick's photo deleted/soft-removed: gugur, tanpa fallback
			}
			return nil, err
		}
		return rec, nil
	}
	isTrue := true
	page, err := photos.ListPhotos(ctx, repository.PhotoFilter{
		ParticipantID: participantID, SessionID: sessionID, IsReportPhoto: &isTrue,
	}, 1, 1)
	if err != nil {
		return nil, err
	}
	if len(page.Items) == 0 {
		return nil, nil
	}
	return &page.Items[0], nil // Paginated.Items bersifat nilai (T, bukan *T)
}

// bindUUID pulls a path param, validates it is a UUID, and responds 400 if not.
// Returns (id, true) on success.
func bindUUID(c *echo.Context, name string) (string, bool) {
	v := (*c).Param(name)
	if v == "" || uuid.Validate(v) != nil {
		if err := appresp.Fail(c, http.StatusBadRequest, "invalid_body"); err != nil {
			log.Printf("handler: failed to write bindUUID error: %v", err)
		}
		return "", false
	}
	return v, true
}

// bindAndValidate binds the request body into req and validates it, writing the
// standard error envelope on failure. It returns a non-nil error to short-circuit
// the handler (e.g. `if err := bindAndValidate(c, &req); err != nil { return err }`).
func bindAndValidate(c *echo.Context, req interface{}) error {
	if err := (*c).Bind(req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	return nil
}

// queryInt reads a query param as int with a default.
func queryInt(c *echo.Context, name string, def int) int {
	v := (*c).QueryParam(name)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

// pagination extracts page/limit from the query, clamped to safe bounds.
func pagination(c *echo.Context) (page, limit int) {
	page = queryInt(c, "page", 1)
	limit = queryInt(c, "limit", constants.DefaultPageLimit)
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = constants.DefaultPageLimit
	}
	if limit > constants.MaxPageLimit {
		limit = constants.MaxPageLimit
	}
	return page, limit
}

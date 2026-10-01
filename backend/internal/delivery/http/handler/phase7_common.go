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

// sessionScope provides the session/participant/group reads used by the tenant
// and facilitator-ownership checks on the photo, upload, and session-group
// endpoints. It is a subset of repository.SessionRepository, satisfied by
// persistence.GormSessionRepository.
type sessionScope interface {
	GetSessionByID(ctx context.Context, id, tenantID string) (*entity.Session, error)
	GetParticipantByID(ctx context.Context, id, tenantID string) (*entity.Participant, error)
	GetGroupFacilitatorID(ctx context.Context, groupID string) (*string, error)
}

// consentScope provides the fresh consent read used by the consent gates
// (subset of repository.ConsentRepository, satisfied by
// persistence.GormConsentRepository).
type consentScope interface {
	GetConsentValue(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) (bool, error)
}

// assertFacilitatorOwnership mirrors live_usecase.assertOwnership for handler
// checks: a FASILITATOR may mutate only the group they own; ADMIN/KOORDINATOR/
// SUPER_ADMIN bypass. An unassigned group (nil owner) denies every facilitator
// — an admin must assign it first.
func assertFacilitatorOwnership(actorRole, actorID string, groupFacilitatorID *string) error {
	if entity.UserRole(actorRole) != entity.RoleFasilitator {
		return nil
	}
	if groupFacilitatorID == nil || *groupFacilitatorID != actorID {
		return apperrors.Forbidden("not_group_owner", errors.New("facilitator does not own this group"))
	}
	return nil
}

// assertParticipantGroupOwnership denies a FASILITATOR any mutation on a
// participant outside their own groups (photo upload/mutations); non-
// facilitator roles bypass. The participant is read tenant-scoped, so a
// cross-tenant or missing participant surfaces as 404 not_found.
func assertParticipantGroupOwnership(ctx context.Context, sessions sessionScope, tenantID, actorRole, actorID, participantID string) error {
	if entity.UserRole(actorRole) != entity.RoleFasilitator {
		return nil
	}
	p, err := sessions.GetParticipantByID(ctx, participantID, tenantID)
	if err != nil {
		return err
	}
	var owner *string
	if p.GroupID != nil {
		owner, err = sessions.GetGroupFacilitatorID(ctx, *p.GroupID)
		if err != nil {
			return err
		}
	}
	return assertFacilitatorOwnership(actorRole, actorID, owner)
}

// resolveReportPhoto returns the photo backing a report for one participant,
// session and topic (program stage). An explicit report_photo_picks row wins;
// when no pick row exists — or the pick's photo was deleted — the session's
// exclusive is_report_photo default is the fallback, so the mini-raport photo
// always replaces the placeholder whenever a flagged photo exists (spec §4.1).
func resolveReportPhoto(ctx context.Context, photos repository.PhotoRepository,
	participantID, sessionID, programStageID string) (*entity.SmartPhoto, error) {
	pick, err := photos.GetReportPhotoPick(ctx, participantID, sessionID, programStageID)
	if err != nil {
		return nil, err
	}
	if pick != nil {
		rec, err := photos.GetPhotoByID(ctx, pick.PhotoID, "")
		if err == nil {
			return rec, nil
		}
		var ae *apperrors.AppError
		if !(errors.As(err, &ae) && ae.Status == http.StatusNotFound) {
			return nil, err
		}
		// Pick's photo deleted/soft-removed: gugur — jatuh ke fallback
		// is_report_photo di bawah (tanpa referensi menggantung).
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

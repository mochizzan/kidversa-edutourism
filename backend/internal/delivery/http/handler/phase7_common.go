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
	// ListSessionStages lists a session's session_stages (its topics, created in
	// program sequence). Used to prove a requested session_stage_id BELONGS to
	// the session (upload) and to resolve a report's program stage to its
	// session stage for topic-true photo resolution.
	ListSessionStages(ctx context.Context, sessionID string) ([]entity.SessionStage, error)
	GetGroupFacilitatorID(ctx context.Context, groupID string) (*string, error)
}

// stageLister is the session-stage read the topic-scoped report-photo
// resolution needs (subset of repository.SessionRepository, satisfied by
// persistence.GormSessionRepository and by sessionScope).
type stageLister interface {
	ListSessionStages(ctx context.Context, sessionID string) ([]entity.SessionStage, error)
}

// consentScope provides the fresh consent read used by the consent gates
// (subset of repository.ConsentRepository, satisfied by
// persistence.GormConsentRepository).
type consentScope interface {
	GetConsentValue(ctx context.Context, participantID, sessionID string, consentType entity.ConsentType) (bool, error)
}

// isGroupOwner reports whether the actor may treat the group as their own: a
// FASILITATOR owns only groups whose facilitator_id matches their user id
// (an unassigned group is owned by no facilitator); every other role
// (ADMIN/KOORDINATOR/SUPER_ADMIN) owns all groups. Read-side companion of
// assertFacilitatorOwnership — powers the is_owner flag on the group lists.
func isGroupOwner(actorRole, actorID string, groupFacilitatorID *string) bool {
	if entity.UserRole(actorRole) != entity.RoleFasilitator {
		return true
	}
	return groupFacilitatorID != nil && *groupFacilitatorID == actorID
}

// assertFacilitatorOwnership mirrors live_usecase.assertOwnership for handler
// checks: a FASILITATOR may mutate only the group they own; ADMIN/KOORDINATOR/
// SUPER_ADMIN bypass. An unassigned group (nil owner) denies every facilitator
// — an admin must assign it first.
func assertFacilitatorOwnership(actorRole, actorID string, groupFacilitatorID *string) error {
	if isGroupOwner(actorRole, actorID, groupFacilitatorID) {
		return nil
	}
	return apperrors.Forbidden("not_group_owner", errors.New("facilitator does not own this group"))
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
// Two-tier form only: the public gallery's computed report_photo (gallery_handler)
// uses it as-is — tier 3 below must never mark a plain gallery photo as the
// report photo there.
//
// Topic truth (migration 000009): when the report HAS a topic
// (programStageID != ""), tiers 2-3 run with a strict session_stage_id filter
// resolved via sessions.ListSessionStages — a photo flagged/newest under a
// DIFFERENT topic, or a legacy no-stage photo, can never serve it. A report
// without a topic keeps today's session-wide behavior (stageFilter = nil).
func resolveReportPhoto(ctx context.Context, photos repository.PhotoRepository, sessions stageLister,
	participantID, sessionID, programStageID string) (*entity.SmartPhoto, error) {
	return resolveReportPhotoTiers(ctx, photos, sessions, participantID, sessionID, programStageID, false)
}

// resolveReportPhotoWithFallback = resolveReportPhoto (spec §4.1, tier pick →
// is_report_photo) plus Fase-2 tier 3 for the parent mini-raport: when neither
// a pick nor a flagged photo exists, the participant's newest gallery photo in
// the session wins (ListPhotos orders created_at DESC, tie-break taken_at lalu
// id), so "Momen Terbaik Hari Ini" falls back to a real photo before the
// placeholder. The photo must belong to this participant+session (PhotoFilter
// scoping) AND — like tier 2, when the report has a topic — to the report's
// topic (same stage filter); no photo at all → (nil, nil) → placeholder.
// Report routes ONLY (GetByAccessToken/GetAccessPhoto, after the ConsentPhoto
// gate) — the public gallery keeps resolveReportPhoto so its computed
// report_photo stays two-tier.
func resolveReportPhotoWithFallback(ctx context.Context, photos repository.PhotoRepository, sessions stageLister,
	participantID, sessionID, programStageID string) (*entity.SmartPhoto, error) {
	return resolveReportPhotoTiers(ctx, photos, sessions, participantID, sessionID, programStageID, true)
}

// resolveReportPhotoTiers implements both helpers above; withFallback selects
// whether tier 3 (newest gallery photo) runs after tier 2 misses.
func resolveReportPhotoTiers(ctx context.Context, photos repository.PhotoRepository, sessions stageLister,
	participantID, sessionID, programStageID string, withFallback bool) (*entity.SmartPhoto, error) {
	// Tier 1 — explicit report_photo_picks row. The pick is already keyed by
	// program_stage_id, so it is topic-true as stored; reads of EXISTING picks
	// stay tolerant (the photo's own stage is not re-checked here).
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

	// Topic scope for tiers 2-3. nil = no stage filter (legacy session-wide
	// report: programStageID empty). Non-nil = strict session_stage_id equality.
	var stageFilter *string
	if programStageID != "" {
		stages, err := sessions.ListSessionStages(ctx, sessionID)
		if err != nil {
			// Never degrade to an unscoped (cross-topic) query on failure —
			// log the cause, then surface (middleware renders internal_error).
			log.Printf("handler: report photo stage lookup failed (session=%s stage=%s): %v",
				sessionID, programStageID, err)
			return nil, err
		}
		var stageID string
		for i := range stages {
			if stages[i].ProgramStageID == programStageID {
				stageID = stages[i].ID
				break
			}
		}
		if stageID == "" {
			// The report's topic was never instantiated in this session: no
			// photo can be proven topic-true for it, and an unscoped fallback
			// would hand it a photo from another topic (legacy '' included).
			return nil, nil
		}
		stageFilter = &stageID
	}

	// Tier 2 — exclusive is_report_photo default, scoped to the topic.
	isTrue := true
	page, err := photos.ListPhotos(ctx, repository.PhotoFilter{
		ParticipantID: participantID, SessionID: sessionID, IsReportPhoto: &isTrue, SessionStageID: stageFilter,
	}, 1, 1)
	if err != nil {
		// Repo failure (not "no photo"): log the cause before returning —
		// middleware.ErrorHandler renders a generic internal_error envelope
		// WITHOUT logging, so without this line the reason would be silent.
		log.Printf("handler: report photo resolve failed (participant=%s session=%s stage=%s): %v",
			participantID, sessionID, programStageID, err)
		return nil, err
	}
	if len(page.Items) > 0 {
		return &page.Items[0], nil // Paginated.Items bersifat nilai (T, bukan *T)
	}
	if !withFallback {
		return nil, nil
	}

	// Tier 3 — newest gallery photo under the SAME topic scope (a plain gallery
	// photo of another topic — or a legacy ''-stage photo — never wins).
	page, err = photos.ListPhotos(ctx, repository.PhotoFilter{
		ParticipantID: participantID, SessionID: sessionID, SessionStageID: stageFilter,
	}, 1, 1)
	if err != nil {
		// Tier-3 gallery fallback failed: never degrade silently into a nil
		// (placeholder) as if the gallery were empty — log and surface.
		log.Printf("handler: report photo gallery fallback failed (participant=%s session=%s): %v",
			participantID, sessionID, err)
		return nil, err
	}
	if len(page.Items) == 0 {
		return nil, nil
	}
	return &page.Items[0], nil
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

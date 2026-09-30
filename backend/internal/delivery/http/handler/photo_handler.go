package handler

import (
	"context"
	"errors"
	"log"
	"net/http"

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

// programScope provides the stage -> program reads used to validate a report
// pick's program_stage_id (existence + tenant), a subset of
// repository.ProgramRepository (satisfied by persistence.GormProgramRepository).
type programScope interface {
	GetStageByID(ctx context.Context, id string) (*entity.ProgramStage, error)
	GetProgramByID(ctx context.Context, id string) (*entity.Program, error)
}

// PhotoHandler serves /api/photos/* (CRUD over SmartPhoto records). Upload is a
// separate endpoint (RegisterUploadRoutes); this handler covers list/update/
// delete plus the report-photo pick endpoints. All mutations are tenant-scoped,
// facilitator-ownership-checked (§5.B), and consent-gated where required (§5.C).
type PhotoHandler struct {
	photos   repository.PhotoRepository
	sessions sessionScope
	consent  consentScope
	programs programScope
	cfg      *config.Config
}

// NewPhotoHandler builds the photo handler.
func NewPhotoHandler(
	photos repository.PhotoRepository,
	sessions sessionScope,
	consent consentScope,
	programs programScope,
	cfg *config.Config,
) *PhotoHandler {
	return &PhotoHandler{photos: photos, sessions: sessions, consent: consent, programs: programs, cfg: cfg}
}

// List handles GET /api/photos (filter by ?participant_id= or ?session_id=).
// Results are scoped to the caller's tenant: a photo inherits the tenant of its
// owning session (PhotoFilter.TenantID -> scopeByTenant).
func (h *PhotoHandler) List(c *echo.Context) error {
	f := repository.PhotoFilter{
		TenantID:      appmiddleware.GetTenantID(c),
		ParticipantID: (*c).QueryParam("participant_id"),
		SessionID:     (*c).QueryParam("session_id"),
	}
	page, limit := pagination(c)
	res, err := h.photos.ListPhotos((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, dto.NewPhotoListResponse(res.Items), &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

// Delete handles DELETE /api/photos/:id. The tenant check runs first, then the
// facilitator-ownership gate, then the row delete; the stored file(s) under
// UploadDir are unlinked afterwards so no orphan files are left on disk (§4).
// Unlink failures (including already-missing files) are logged, never fatal.
func (h *PhotoHandler) Delete(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ctx := (*c).Request().Context()
	tenantID := appmiddleware.GetTenantID(c)
	// Tenant check: only photos in the caller's tenant may be deleted.
	p, err := h.photos.GetPhotoByID(ctx, id, tenantID)
	if err != nil {
		return err
	}
	if err := h.assertPhotoOwnership(c, p.ParticipantID); err != nil {
		return err
	}
	if err := h.photos.DeletePhoto(ctx, id); err != nil {
		return err
	}
	for _, rel := range []string{p.OriginalFileURL, p.FramedFileURL} {
		if rel == "" {
			continue
		}
		if rmErr := removeStored(h.cfg.UploadDir, rel); rmErr != nil {
			log.Printf("photo: failed to remove orphan file %s: %v", rel, rmErr)
		}
	}
	return appresp.NoContent(c)
}

// Update handles PUT /api/photos/:id (partial map update, C2 zero-value safe).
// The body is validated (§5.D), then existence + tenant are verified BEFORE any
// write, then the facilitator-ownership gate runs.
// is_report_photo is intentionally NOT part of the whitelist: the exclusive
// is_report_photo default is set via POST /:id/set-report-photo.
func (h *PhotoHandler) Update(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.PhotoRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	// bindAndValidate writes the 400 envelope itself but returns nil when it
	// rejects the body — Committed is the failure signal (same as
	// UserHandler.Update); without this check an invalid body would still
	// reach the write below.
	if resp, okResp := (*c).Response().(*echo.Response); okResp && resp.Committed {
		return nil
	}
	ctx := (*c).Request().Context()
	tenantID := appmiddleware.GetTenantID(c)
	// Existence + tenant check BEFORE the write (previously the update ran
	// unscoped and only the read-back 404'd).
	p, err := h.photos.GetPhotoByID(ctx, id, tenantID)
	if err != nil {
		return err
	}
	if err := h.assertPhotoOwnership(c, p.ParticipantID); err != nil {
		return err
	}
	fields := map[string]interface{}{}
	if req.FramedFileURL != "" {
		fields["framed_file_url"] = req.FramedFileURL
	}
	if req.TakenBy != "" {
		fields["taken_by"] = req.TakenBy
	}
	if req.TakenAt != "" {
		// Strict ISO parse: an unparseable value is rejected instead of being
		// written raw into the taken_at column.
		t, ok := apputil.ParseISO(req.TakenAt)
		if !ok {
			return appresp.Fail(c, http.StatusBadRequest, "validation_error")
		}
		fields["taken_at"] = t
	}
	if req.FrameID != "" {
		fid := req.FrameID
		fields["frame_id"] = &fid
	}
	if len(fields) == 0 {
		// Nothing to update — still return the current record.
		return appresp.OK(c, dto.NewPhotoResponse(p))
	}
	if err := h.photos.UpdatePhotoFields(ctx, id, fields); err != nil {
		return err
	}
	updated, err := h.photos.GetPhotoByID(ctx, id, tenantID)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewPhotoResponse(updated))
}

// SetReportPhoto handles POST /api/photos/:id/set-report-photo (exclusive flag).
// Tenant is verified by the scoped photo read; ownership (§5.B) and fresh
// consent_photo (§5.C) are enforced before the write.
func (h *PhotoHandler) SetReportPhoto(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	ctx := (*c).Request().Context()
	p, err := h.photos.GetPhotoByID(ctx, id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	if err := h.assertPhotoOwnership(c, p.ParticipantID); err != nil {
		return err
	}
	if err := h.requirePhotoConsent(c, p.ParticipantID, p.SessionID); err != nil {
		return err
	}
	if err := h.photos.SetReportPhoto(ctx, p.ParticipantID, p.SessionID, id); err != nil {
		return err
	}
	updated, err := h.photos.GetPhotoByID(ctx, id, appmiddleware.GetTenantID(c))
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewPhotoResponse(updated))
}

// SetReportPick upserts this participant's chosen report photo for one topic.
// The photo read is tenant-scoped; the program_stage_id must exist in the
// caller's tenant (§5.D); ownership (§5.B) and consent (§5.C) gate the write.
func (h *PhotoHandler) SetReportPick(c *echo.Context) error {
	var req dto.ReportPhotoPickRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	// bindAndValidate writes the 400 envelope itself but returns nil when it
	// rejects the body — Committed is the failure signal (same as
	// UserHandler.Update); without this check an invalid body would still
	// reach the upsert below.
	if resp, okResp := (*c).Response().(*echo.Response); okResp && resp.Committed {
		return nil
	}
	ctx := (*c).Request().Context()
	tenantID := appmiddleware.GetTenantID(c)
	p, err := h.photos.GetPhotoByID(ctx, req.PhotoID, tenantID)
	if err != nil {
		return err // cross-tenant / missing photo -> 404 not_found
	}
	if p.ParticipantID != req.ParticipantID || p.SessionID != req.SessionID {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	if err := h.assertStageInTenant(c, req.ProgramStageID); err != nil {
		return err
	}
	if err := h.assertPhotoOwnership(c, p.ParticipantID); err != nil {
		return err
	}
	if err := h.requirePhotoConsent(c, p.ParticipantID, p.SessionID); err != nil {
		return err
	}
	pick := &entity.ReportPhotoPick{
		ParticipantID:  req.ParticipantID,
		SessionID:      req.SessionID,
		ProgramStageID: req.ProgramStageID,
		PhotoID:        req.PhotoID,
	}
	if err := h.photos.UpsertReportPhotoPick(ctx, pick); err != nil {
		return err
	}
	return appresp.OK(c, dto.NewPhotoResponse(p))
}

// DeleteReportPick clears the pick for one topic (idempotent). The pick's
// session must belong to the caller's tenant (§5.A); ownership (§5.B) and
// consent (§5.C) gate the delete.
func (h *PhotoHandler) DeleteReportPick(c *echo.Context) error {
	participantID := (*c).QueryParam("participant_id")
	sessionID := (*c).QueryParam("session_id")
	programStageID := (*c).QueryParam("program_stage_id")
	if participantID == "" || sessionID == "" || programStageID == "" ||
		uuid.Validate(participantID) != nil || uuid.Validate(sessionID) != nil || uuid.Validate(programStageID) != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	ctx := (*c).Request().Context()
	tenantID := appmiddleware.GetTenantID(c)
	if _, err := h.sessions.GetSessionByID(ctx, sessionID, tenantID); err != nil {
		return err // cross-tenant / missing session -> 404 not_found
	}
	if err := h.assertPhotoOwnership(c, participantID); err != nil {
		return err
	}
	if err := h.requirePhotoConsent(c, participantID, sessionID); err != nil {
		return err
	}
	if err := h.photos.DeleteReportPhotoPick(ctx, participantID, sessionID, programStageID); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

// ListReportPicks returns all topic picks for one participant+session.
// Tenant-scoped via the pick's session (§5.A).
func (h *PhotoHandler) ListReportPicks(c *echo.Context) error {
	participantID := (*c).QueryParam("participant_id")
	sessionID := (*c).QueryParam("session_id")
	if participantID == "" || sessionID == "" ||
		uuid.Validate(participantID) != nil || uuid.Validate(sessionID) != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	ctx := (*c).Request().Context()
	if _, err := h.sessions.GetSessionByID(ctx, sessionID, appmiddleware.GetTenantID(c)); err != nil {
		return err // cross-tenant / missing session -> 404 not_found
	}
	picks, err := h.photos.ListReportPhotoPicks(ctx, participantID, sessionID)
	if err != nil {
		return err
	}
	resp := make([]dto.ReportPhotoPickResponse, 0, len(picks))
	for _, pk := range picks {
		resp = append(resp, dto.ReportPhotoPickResponse{ProgramStageID: pk.ProgramStageID, PhotoID: pk.PhotoID})
	}
	return appresp.OK(c, resp)
}

// assertPhotoOwnership enforces §5.B on photo mutations: a FASILITATOR may only
// mutate photos of participants inside their own group; ADMIN/KOORDINATOR/
// SUPER_ADMIN bypass.
func (h *PhotoHandler) assertPhotoOwnership(c *echo.Context, participantID string) error {
	return assertParticipantGroupOwnership(
		(*c).Request().Context(), h.sessions,
		appmiddleware.GetTenantID(c), appmiddleware.GetRole(c), appmiddleware.GetUserID(c),
		participantID,
	)
}

// requirePhotoConsent denies with 403 consent_required unless the participant's
// fresh PHOTO consent for the session is granted — the same gate the upload
// endpoint applies before persisting a file (§5.C). It returns the AppError so
// the caller stops before mutating; middleware.ErrorHandler renders the
// consent_required envelope.
func (h *PhotoHandler) requirePhotoConsent(c *echo.Context, participantID, sessionID string) error {
	granted, err := h.consent.GetConsentValue((*c).Request().Context(), participantID, sessionID, entity.ConsentPhoto)
	if err != nil {
		return err
	}
	if !granted {
		return apperrors.Forbidden("consent_required", errors.New("participant has not granted photo consent"))
	}
	return nil
}

// assertStageInTenant rejects a report pick whose program_stage_id does not
// resolve inside the caller's tenant (stage -> program -> tenant), so orphan or
// cross-tenant stage UUIDs are never persisted (§5.D). Missing/cross-tenant IDs
// surface as a 400 validation_error AppError (the caller stops before the
// upsert; middleware.ErrorHandler renders the envelope); infrastructure errors
// pass through.
func (h *PhotoHandler) assertStageInTenant(c *echo.Context, stageID string) error {
	ctx := (*c).Request().Context()
	tenantID := appmiddleware.GetTenantID(c)
	stage, err := h.programs.GetStageByID(ctx, stageID)
	if err != nil {
		return stageValidationError(err)
	}
	prog, err := h.programs.GetProgramByID(ctx, stage.ProgramID)
	if err != nil {
		return stageValidationError(err)
	}
	if tenantID != "" && (prog.TenantID == nil || *prog.TenantID != tenantID) {
		return apperrors.BadRequest("validation_error", errors.New("program stage does not belong to the caller's tenant"))
	}
	return nil
}

// stageValidationError maps "referenced stage/program not found" onto the 400
// validation_error AppError; any other error (DB etc.) is returned untouched.
func stageValidationError(err error) error {
	var ae *apperrors.AppError
	if errors.As(err, &ae) && ae.Status == http.StatusNotFound {
		return apperrors.BadRequest("validation_error", errors.New("program stage or program not found"))
	}
	return err
}

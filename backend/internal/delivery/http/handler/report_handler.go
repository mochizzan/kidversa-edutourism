package handler

import (
	"context"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/pkg/sse"
	reportsuc "kidversa-edutourism-backend/internal/usecase/reports"
)

// tokenFormat matches a 64-hex-char parent access token.
var tokenFormat = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

// ReportHandler serves /api/reports/* (authenticated) and the public token
// access endpoint. Parent access tokens are anti-IDOR: unguessable 64hex,
// single-report scope, expiry, revocation.
type ReportHandler struct {
	uc          *reportsuc.Usecase
	cfg         *config.Config
	sessionRepo repository.SessionRepository
	hub         *sse.Hub
	consent     repository.ConsentRepository
	photos      repository.PhotoRepository
	genMu       sync.Map
}

// NewReportHandler builds the report handler.
func NewReportHandler(uc *reportsuc.Usecase, cfg *config.Config, sessionRepo repository.SessionRepository, hub *sse.Hub, consent repository.ConsentRepository, photos repository.PhotoRepository) *ReportHandler {
	return &ReportHandler{uc: uc, cfg: cfg, sessionRepo: sessionRepo, hub: hub, consent: consent, photos: photos}
}

// tenantGuard rejects an empty tenant ID with 400 "tenant_required" before any
// tenant-scoped work begins. Without it, GenerateStream would spawn its
// background goroutine with a blank scope and surface an English SSE error
// ("tenant ID is required") instead of a clear 400.
func tenantGuard(c *echo.Context, tenantID string) error {
	if tenantID == "" {
		return appresp.Fail(c, http.StatusBadRequest, "tenant_required")
	}
	return nil
}

// GetByAccessToken handles GET /api/reports/access?token=... (PUBLIC).
// Verifies the token (64hex, not revoked, not expired) and returns a DTO
// stripped of PII and the token itself. photo_url is set only when photo
// consent is granted AND a photo resolves for the report's topic; the token
// itself never enters the DTO — the client composes the photo URL.
func (h *ReportHandler) GetByAccessToken(c *echo.Context) error {
	token := (*c).QueryParam("token")
	if token == "" {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	if !tokenFormat.MatchString(token) {
		return appresp.Fail(c, http.StatusBadRequest, "bad_request")
	}
	ctx := (*c).Request().Context()
	r, err := h.uc.Repo().GetByToken(ctx, token)
	if err != nil {
		return err
	}
	photoURL := ""
	granted, err := h.consent.GetConsentValue(ctx, r.ParticipantID, r.SessionID, entity.ConsentPhoto)
	if err != nil {
		return err
	}
	if granted {
		resolved, err := resolveReportPhoto(ctx, h.photos, r.ParticipantID, r.SessionID, r.ProgramStageID)
		if err != nil {
			return err
		}
		if resolved != nil {
			photoURL = "/api/reports/access/photo"
		}
	}
	return appresp.OK(c, dto.NewPublicReportDTO(r, photoURL))
}

// GetAccessPhoto serves the report's resolved topic photo as raw bytes for
// the parent-facing mini-raport <img>. Token is validated like the sibling
// access endpoint but with spec §2.6 codes; consent is mandatory.
func (h *ReportHandler) GetAccessPhoto(c *echo.Context) error {
	ctx := (*c).Request().Context()
	token := (*c).QueryParam("token")
	if token == "" || !tokenFormat.MatchString(token) {
		return apperrors.NotFound("token_invalid", nil) // spec §2.6 (404, bukan 400)
	}
	r, err := h.uc.Repo().GetByToken(ctx, token) // 404 token_invalid / 403 token_expired — persis GetByToken
	if err != nil {
		return err
	}
	granted, err := h.consent.GetConsentValue(ctx, r.ParticipantID, r.SessionID, entity.ConsentPhoto)
	if err != nil {
		return err
	}
	if !granted {
		return apperrors.Forbidden("consent_required", nil)
	}
	rec, err := resolveReportPhoto(ctx, h.photos, r.ParticipantID, r.SessionID, r.ProgramStageID)
	if err != nil {
		return err
	}
	if rec == nil {
		return apperrors.NotFound("not_found", nil) // 404 — foto resolusi tidak ada
	}
	// Pola media_handler.Get + batasi gambar (R10).
	dest := filepath.Join(h.cfg.UploadDir, filepath.FromSlash(rec.OriginalFileURL))
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

// Generate handles POST /api/reports/:id/generate.
func (h *ReportHandler) Generate(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	r, err := h.uc.GenerateNarrative((*c).Request().Context(), id, tenantID)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportResponse(r))
}

// GenerateStream handles POST /api/reports/:id/generate/stream (JWT, tenant-scoped).
// Validates ownership, then kicks off an async narrative generation and returns
// 202 immediately. Tokens are delivered over the SSE endpoint
// GET /api/reports/:id/generate/stream. A per-report guard prevents concurrent
// generations (which would interleave tokens across tabs).
func (h *ReportHandler) GenerateStream(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	// Ownership check up front so we never stream a report the caller can't see.
	if _, err := h.uc.Repo().GetByID((*c).Request().Context(), id, tenantID); err != nil {
		return err
	}
	force := (*c).QueryParam("force") == "true"
	if !h.tryBeginGenerate(id) {
		return appresp.Fail(c, http.StatusConflict, "already_generating")
	}
	defer h.endGenerate(id)
	// Detached context survives the 202 response so generation keeps running.
	go h.runNarrativeStream(context.WithoutCancel((*c).Request().Context()), id, tenantID, force)
	// 204 (no body): the narrative arrives over the SSE endpoint, not here.
	// The FE client treats 204 as no-content, so it must not body-parse this.
	return appresp.NoContent(c)
}

// GenerateStreamSSE handles GET /api/reports/:id/generate/stream (SSE, JWT).
// Tenant ownership is re-checked here (E-S8a) before subscribing.
func (h *ReportHandler) GenerateStreamSSE(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	if _, err := h.uc.Repo().GetByID((*c).Request().Context(), id, tenantID); err != nil {
		return err
	}
	return streamSSE(c, h.hub, sse.NarrativeChannel(id), nil, h.cfg.SSEKeepaliveSec)
}

func (h *ReportHandler) tryBeginGenerate(id string) bool {
	_, loaded := h.genMu.LoadOrStore(id, struct{}{})
	return !loaded
}

func (h *ReportHandler) endGenerate(id string) { h.genMu.Delete(id) }

// runNarrativeStream runs the streaming generation in the background, publishing
// token/done/error events on the report's SSE channel.
func (h *ReportHandler) runNarrativeStream(ctx context.Context, id, tenantID string, force bool) {
	ch := sse.NarrativeChannel(id)
	full, err := h.uc.StreamNarrative(ctx, id, tenantID, force, func(delta string) error {
		if perr := h.hub.Publish(ctx, ch, sse.Event{Type: "token", Data: map[string]string{"delta": delta}}); perr != nil {
			log.Printf("report: sse publish token failed for %s: %v", id, perr)
		}
		return nil
	})
	if err != nil {
		log.Printf("DEBUG stream err %s: %v", id, err)
		_, code, _ := apperrors.AsAppError(err)
		msg := appresp.MessageForCode(code)
		if perr := h.hub.Publish(ctx, ch, sse.Event{Type: "error", Data: map[string]string{"code": code, "message": msg}}); perr != nil {
			log.Printf("report: sse publish error failed for %s: %v", id, perr)
		}
		return
	}
	if perr := h.hub.Publish(ctx, ch, sse.Event{Type: "done", Data: map[string]string{"full": full}}); perr != nil {
		log.Printf("report: sse publish done failed for %s: %v", id, perr)
	}
}

// GenerateForSession handles POST /api/reports/generate.
// Creates DRAFT reports for all participants in the session that don't have one
// yet, then triggers narrative generation for every report. Reports are created
// per (participant, topic) so the invariant 1 Report = 1 Topic = 1 Participant
// holds; the session's Topics are resolved from its session_stages.
func (h *ReportHandler) GenerateForSession(c *echo.Context) error {
	var req dto.ReportGenerateSessionRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	// Resolve the session's Topics (program_stage_ids) to scope per-Topic reports.
	topicIDs, terr := h.resolveSessionTopics((*c).Request().Context(), req.SessionID)
	if terr != nil {
		return terr
	}
	if req.ParticipantID != "" {
		if !h.tryBeginGenerate(req.SessionID) {
			return appresp.Fail(c, http.StatusConflict, "already_generating")
		}
		parts, lerr := h.sessionRepo.ListParticipants((*c).Request().Context(), req.SessionID, "", tenantID)
		if lerr != nil {
			h.endGenerate(req.SessionID)
			return appresp.Fail(c, http.StatusInternalServerError, "internal_error")
		}
		var one *entity.Participant
		for i := range parts {
			if parts[i].ID == req.ParticipantID {
				one = &parts[i]
				break
			}
		}
		if one == nil {
			h.endGenerate(req.SessionID)
			return appresp.FailMsg(c, http.StatusNotFound, "participant_not_in_session", "Peserta tidak terdaftar di sesi ini")
		}
		if !h.tryBeginGenerate(req.SessionID + ":" + req.ParticipantID) {
			h.endGenerate(req.SessionID)
			return appresp.Fail(c, http.StatusConflict, "already_generating")
		}
		defer h.endGenerate(req.SessionID + ":" + req.ParticipantID)
		defer h.endGenerate(req.SessionID)
		reports, err := h.uc.GenerateForSession((*c).Request().Context(), req.SessionID, tenantID, []entity.Participant{*one}, topicIDs)
		if err != nil {
			return appresp.Fail(c, http.StatusInternalServerError, "internal_error")
		}
		return appresp.OK(c, dto.NewReportListResponse(reports))
	}
	if !h.tryBeginGenerate(req.SessionID) {
		return appresp.Fail(c, http.StatusConflict, "already_generating")
	}
	defer h.endGenerate(req.SessionID)
	participants, err := h.sessionRepo.ListParticipants((*c).Request().Context(), req.SessionID, "", tenantID)
	if err != nil {
		return err
	}
	reports, err := h.uc.GenerateForSession((*c).Request().Context(), req.SessionID, tenantID, participants, topicIDs)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportListResponse(reports))
}

// resolveSessionTopics returns the program_stage_ids of the session's
// session_stages (one per Topic the session instantiates).
func (h *ReportHandler) resolveSessionTopics(ctx context.Context, sessionID string) ([]string, error) {
	stages, err := h.sessionRepo.ListSessionStages(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(stages))
	for i := range stages {
		ids = append(ids, stages[i].ProgramStageID)
	}
	return ids, nil
}

// Approve handles POST /api/reports/:id/approve.
func (h *ReportHandler) Approve(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.ReportApproveRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	r, err := h.uc.Approve((*c).Request().Context(), id, tenantID, req.ApprovedBy, req.NarrativeFinal, req.MissionIDs)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportResponse(r))
}

// Send handles POST /api/reports/:id/send (generates a fresh parent token).
// The token TTL defaults to the configured ReportTokenTTL, overridable per
// request via ReportSendRequest.TTLHours.
func (h *ReportHandler) Send(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	// Default to the configured report token TTL; allow a positive per-request override.
	ttl := int(math.Round(h.cfg.ReportTokenTTL.Hours()))
	var req dto.ReportSendRequest
	if err := (*c).Bind(&req); err == nil && req.TTLHours > 0 {
		ttl = req.TTLHours
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	r, err := h.uc.Send((*c).Request().Context(), id, tenantID, ttl)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportTokenResponse(r))
}

// RevokeToken handles POST /api/reports/:id/revoke-token.
func (h *ReportHandler) RevokeToken(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	r, err := h.uc.RevokeToken((*c).Request().Context(), id, tenantID)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportResponse(r))
}

// SuggestMissions handles POST /api/reports/:id/suggest-missions.
// Returns up to MaxReportMissions mission IDs recommended for the report's
// Topic (program_stage), scoped strictly to that Topic's active missions. No
// persistence — the caller pre-fills the manual selector and persists on Approve.
func (h *ReportHandler) SuggestMissions(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	ids, err := h.uc.SuggestMissions((*c).Request().Context(), id, tenantID)
	if err != nil {
		return err
	}
	return appresp.OK(c, map[string]interface{}{"mission_ids": ids})
}

// SaveMissions handles POST /api/reports/:id/missions.
// Persists the selected mission IDs without changing report status. Used for
// auto-saving mission selections while the admin is still reviewing.
func (h *ReportHandler) SaveMissions(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	var req dto.ReportSaveMissionsRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	r, err := h.uc.SaveMissions((*c).Request().Context(), id, tenantID, req.MissionIDs)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportResponse(r))
}

// ListReports handles GET /api/reports?session_id= (tenant-scoped via TenantScope).
// Returns an empty list (not an error) when no reports match (EC4).
func (h *ReportHandler) ListReports(c *echo.Context) error {
	f := repository.ReportFilter{
		SessionID: (*c).QueryParam("session_id"),
	}
	page, limit := pagination(c)
	res, err := h.uc.Repo().List((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	meta := &appresp.Meta{Page: page, Limit: limit, Total: res.Total}
	return appresp.OKWithMeta(c, dto.NewReportListResponse(res.Items), meta)
}

// GetReport handles GET /api/reports/:id (tenant-scoped via TenantScope).
func (h *ReportHandler) GetReport(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	r, err := h.uc.Repo().GetByID((*c).Request().Context(), id, tenantID)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportResponse(r))
}

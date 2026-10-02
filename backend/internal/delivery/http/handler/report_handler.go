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
	"time"

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
	// sendQueue tracks in-flight POST /:id/send attempts per (tenant, session),
	// backing the active_send envelope and the send_in_progress 409 guard.
	sendQueue *ReportSendQueue
}

// NewReportHandler builds the report handler.
func NewReportHandler(uc *reportsuc.Usecase, cfg *config.Config, sessionRepo repository.SessionRepository, hub *sse.Hub, consent repository.ConsentRepository, photos repository.PhotoRepository) *ReportHandler {
	return &ReportHandler{uc: uc, cfg: cfg, sessionRepo: sessionRepo, hub: hub, consent: consent, photos: photos, sendQueue: NewReportSendQueue()}
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
// Verifies the token (64hex, not revoked, not expired) and returns the full
// mini-raport payload (program/child/session, stages, missions, badges,
// gallery) assembled to equal the admin preview; the raw token itself never
// enters the DTO. photo_url is set only when photo consent is granted AND a
// photo resolves for the report's topic (pick → is_report_photo → newest
// participant gallery photo, Fase 2); the client composes the photo URL.
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
		resolved, err := resolveReportPhotoWithFallback(ctx, h.photos, r.ParticipantID, r.SessionID, r.ProgramStageID)
		if err != nil {
			return err
		}
		if resolved != nil {
			photoURL = "/api/reports/access/photo"
		}
	}
	view, err := h.uc.BuildPublicReportView(ctx, r)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewPublicReportDTO(r, view, photoURL))
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
	rec, err := resolveReportPhotoWithFallback(ctx, h.photos, r.ParticipantID, r.SessionID, r.ProgramStageID)
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
	return serveMediaBlob(c, ct, dest, blob)
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
// holds; the session's Topics are resolved from its session_stages. An
// optional topic_id body field pins the whole run to that single topic (it is
// validated against the session's Topics first), so "generate all" for one
// filtered topic never creates or generates another topic's reports; without
// it every session topic is generated (back-compat).
//
// The run is detached (same pattern as GenerateStream): request validation
// (bind, tenant, topics, participants, genMu guard) runs inline so caller
// mistakes keep their HTTP status codes, then the work executes in a worker
// goroutine on context.WithoutCancel of the request and the handler answers
// 202 immediately — a reload or closed tab can no longer cancel the run. The
// registry run is registered BEFORE the 202 returns, so the first
// GET /api/reports poll after acceptance always observes active_generate.
// The genMu guard still yields 409 already_generating while a run is active.
func (h *ReportHandler) GenerateForSession(c *echo.Context) error {
	var req dto.ReportGenerateSessionRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	// bindAndValidate writes the 400 envelope itself but returns nil when it
	// rejects the body — Committed is the only failure signal (same as
	// UserHandler.Update / CreateSession); without this check an invalid
	// body (bad session_id/topic_id uuid) would keep executing and append a
	// second write to the response.
	if resp, okResp := (*c).Response().(*echo.Response); okResp && resp.Committed {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	// Resolve the session's Topics (program_stage_ids) to scope per-Topic reports.
	// When the request pins a single topic (topic_id), validate it belongs to
	// this session (400 topic_not_in_session otherwise) and generate ONLY that
	// topic: generate-all must never touch another topic's reports (1 topic =
	// 1 separate report). Without topic_id the full session-topic list is
	// passed (back-compat for whole-session / single-topic sessions).
	topicIDs, terr := h.resolveSessionTopics((*c).Request().Context(), req.SessionID)
	if terr != nil {
		return terr
	}
	if req.TopicID != nil && *req.TopicID != "" {
		inSession := false
		for _, id := range topicIDs {
			if id == *req.TopicID {
				inSession = true
				break
			}
		}
		if !inSession {
			return appresp.FailMsg(c, http.StatusBadRequest, "topic_not_in_session", "Topik tidak termasuk dalam sesi ini")
		}
		topicIDs = []string{*req.TopicID}
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
		h.startGenerateRun((*c).Request().Context(), req.SessionID, tenantID,
			[]entity.Participant{*one}, topicIDs, req.SessionID+":"+req.ParticipantID)
		return appresp.AcceptedWithData(c, dto.ReportGenerateAccepted{Status: "accepted", SessionID: req.SessionID})
	}
	if !h.tryBeginGenerate(req.SessionID) {
		return appresp.Fail(c, http.StatusConflict, "already_generating")
	}
	participants, err := h.sessionRepo.ListParticipants((*c).Request().Context(), req.SessionID, "", tenantID)
	if err != nil {
		h.endGenerate(req.SessionID)
		return err
	}
	h.startGenerateRun((*c).Request().Context(), req.SessionID, tenantID, participants, topicIDs, "")
	return appresp.AcceptedWithData(c, dto.ReportGenerateAccepted{Status: "accepted", SessionID: req.SessionID})
}

// startGenerateRun registers the run in the usecase registry (live from the
// moment the 202 returns) and spawns the detached worker. The worker owns the
// genMu guard(s) and the registry entry: both are released when the run ends,
// on success or error. ctx is the request context; the worker runs it through
// context.WithoutCancel so the caller's disconnect never aborts the run.
// extraGuardKey is the per-row generate-one key ("" for a full-session run).
func (h *ReportHandler) startGenerateRun(ctx context.Context, sessionID, tenantID string, participants []entity.Participant, topicIDs []string, extraGuardKey string) {
	runCtx := context.WithoutCancel(ctx)
	h.uc.BeginGenerateRun(sessionID, tenantID)
	acceptedAt := time.Now()
	log.Printf("reports: session generate accepted for %s: participants=%d topics=%d", sessionID, len(participants), len(topicIDs))
	go func() {
		defer h.uc.EndGenerateRun(sessionID)
		defer h.endGenerate(sessionID)
		if extraGuardKey != "" {
			defer h.endGenerate(extraGuardKey)
		}
		if _, err := h.uc.GenerateForSession(runCtx, sessionID, tenantID, participants, topicIDs); err != nil {
			// The run's per-item outcome lives in active_generate; the
			// aggregate failure is logged so it is never silent.
			log.Printf("reports: session generate for %s failed after %s: %v", sessionID, time.Since(acceptedAt).Round(time.Millisecond), err)
			return
		}
		log.Printf("reports: session generate for %s done in %s", sessionID, time.Since(acceptedAt).Round(time.Millisecond))
	}()
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

// Send handles POST /api/reports/:id/send: mints a fresh parent token and
// delivers the report link to the parent's WhatsApp — the report is marked
// SENT only after the gateway accepts the message, otherwise it is recorded as
// SEND_FAILED (retryable) and the error is returned.
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
	// Optional delivery-run tracking: the client declares every report id it
	// still intends to send in this run (including this target). No queue in
	// the body → legacy behavior, no run is touched. With a queue: resolve the
	// report's session, guard against a concurrent in-flight attempt for the
	// same target (409 send_in_progress), register the attempt, and finish it
	// on the way out — success OR error (persisted SENT/SEND_FAILED unchanged).
	if len(req.Queue) > 0 {
		rep, gerr := h.uc.Repo().GetByID((*c).Request().Context(), id, tenantID)
		if gerr != nil {
			return gerr
		}
		if qerr := h.sendQueue.Begin(tenantID, rep.SessionID, id, req.Queue); qerr != nil {
			return qerr
		}
		defer h.sendQueue.Finish(tenantID, rep.SessionID, id)
	}
	r, err := h.uc.Send((*c).Request().Context(), id, tenantID, ttl)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportTokenResponse(r))
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

// EnsureGalleryToken handles POST /api/reports/:id/gallery-token: returns the
// report with a QR-usable gallery token, minting one server-side when it is
// missing (preview built before approval, rows approved before the gallery
// feature) or expired, so the admin mini-raport QR footer always renders real
// QR data instead of silently falling back to the "[ QR CODE ]" placeholder.
func (h *ReportHandler) EnsureGalleryToken(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	tenantID := appmiddleware.GetTenantID(c)
	if err := tenantGuard(c, tenantID); err != nil {
		return err
	}
	r, err := h.uc.EnsureGalleryToken((*c).Request().Context(), id, tenantID)
	if err != nil {
		return err
	}
	return appresp.OK(c, dto.NewReportResponse(r))
}

// ListReports handles GET /api/reports?session_id= (tenant-scoped via TenantScope).
// Returns an empty list (not an error) when no reports match (EC4).
// While a session generate runs (handler genMu guard + usecase registry) or a
// declared send queue has unsent/in-flight rows, the response carries the
// omitempty top-level active_generate / active_send flags; both are
// tenant-filtered like the items query scope and absent on a fresh process.
func (h *ReportHandler) ListReports(c *echo.Context) error {
	sessionID := (*c).QueryParam("session_id")
	f := repository.ReportFilter{
		SessionID: sessionID,
	}
	page, limit := pagination(c)
	res, err := h.uc.Repo().List((*c).Request().Context(), f, page, limit)
	if err != nil {
		return err
	}
	tenantID := appmiddleware.GetTenantID(c)
	resp := dto.NewReportListResponse(res.Items)
	if sessionID != "" {
		if _, generating := h.genMu.Load(sessionID); generating {
			if gs, ok := h.uc.GenerateStatus(sessionID, tenantID); ok {
				resp.ActiveGenerate = dto.NewReportActiveGenerate(gs)
			}
		}
		resp.ActiveSend = h.sendQueue.ActiveSend(tenantID, sessionID)
	}
	meta := &appresp.Meta{Page: page, Limit: limit, Total: res.Total}
	return appresp.OKWithMeta(c, resp, meta)
}

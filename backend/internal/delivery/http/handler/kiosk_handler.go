package handler

import (
	"log"
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
)

// KioskHandler serves the public, token-protected learner kiosk access endpoint.
type KioskHandler struct {
	authUC       *auth.Usecase
	sessionUC    *usecase.SessionUsecase
	contentRepo  repository.ContentRepository
	substageRepo repository.SessionSubstageRepository
	liveRepo     repository.LiveRepository
}

// NewKioskHandler builds the kiosk handler.
func NewKioskHandler(authUC *auth.Usecase, sessionUC *usecase.SessionUsecase, contentRepo repository.ContentRepository, substageRepo repository.SessionSubstageRepository, liveRepo repository.LiveRepository) *KioskHandler {
	return &KioskHandler{authUC: authUC, sessionUC: sessionUC, contentRepo: contentRepo, substageRepo: substageRepo, liveRepo: liveRepo}
}

// kioskStageContent bundles a session stage with its Kegiatan (substage) leaves
// and the content loaded per Kegiatan.
type kioskStageContent struct {
	Stage     entity.SessionStage    `json:"stage"`
	Substages []kioskSubstageContent `json:"substages"`
}

// kioskSubstageContent bundles one instantiated Kegiatan with its content.
type kioskSubstageContent struct {
	Substage entity.SessionSubstage `json:"substage"`
	Contents []entity.StageContent  `json:"contents"`
	Locked   bool                   `json:"locked"`
}

// kioskSessionDTO is the minimal, PII-free session view returned to the public kiosk.
type kioskSessionDTO struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	SessionDate string `json:"session_date"`
	Location    string `json:"location"`
	Status      string `json:"status"`
}

// kioskResponse is the public payload returned to the learner kiosk.
type kioskResponse struct {
	Session kioskSessionDTO     `json:"session"`
	Stages  []kioskStageContent `json:"stages"`
	GroupID string              `json:"group_id,omitempty"`
}

// kioskSubstage returns a session substage with an empty content list.
func kioskSubstage(s entity.SessionSubstage) kioskSubstageContent {
	return kioskSubstageContent{Substage: s, Contents: []entity.StageContent{}}
}

func toKioskSessionDTO(s entity.Session) kioskSessionDTO {
	return kioskSessionDTO{
		ID:          s.ID,
		Name:        s.Name,
		SessionDate: s.SessionDate,
		Location:    s.Location,
		Status:      string(s.Status),
	}
}

// KioskAccess handles the PUBLIC GET /api/sessions/:id/kiosk?token=...
//
// The kiosk token (not a JWT) is the sole authorization. It is valid for its full TTL and
// is multi-use: it is never consumed, so the kiosk may retry freely (e.g. under React
// StrictMode double-invocation). On success it confirms the token's session+tenant binding
// matches the requested session and that the session is not cancelled, then returns the
// session detail (stages + program contents).
//
// Errors: invalid/not-found or session-binding mismatch -> 401 kiosk_invalid; expired token
// -> 401 kiosk_expired; tenant mismatch -> 401 kiosk_forbidden; cancelled session -> 401
// kiosk_cancelled.
func (h *KioskHandler) KioskAccess(c *echo.Context) error {
	id, ok := bindUUID(c, "id")
	if !ok {
		return nil
	}
	token := (*c).QueryParam("token")
	groupId := (*c).QueryParam("groupId")
	if token == "" {
		return appresp.Fail(c, http.StatusUnauthorized, "token_required")
	}

	sessionID, tenantID, err := h.authUC.ValidateKioskToken((*c).Request().Context(), token)
	if err != nil {
		// Expired tokens get a distinct code so the UI can tell the user to ask
		// the facilitator to open the session again; everything else is kiosk_invalid.
		_, code, _ := apperrors.AsAppError(err)
		if code == "kiosk_token_expired" {
			return appresp.Fail(c, http.StatusUnauthorized, "kiosk_expired")
		}
		return appresp.Fail(c, http.StatusUnauthorized, "kiosk_invalid")
	}

	// The token must be bound to the requested session.
	if sessionID != id {
		return appresp.Fail(c, http.StatusUnauthorized, "kiosk_invalid")
	}

	s, err := h.sessionUC.GetSession((*c).Request().Context(), id, "")
	if err != nil {
		return err
	}
	// Tenant binding: the token's tenant must match the session's tenant.
	if s.Session.TenantID == nil || *s.Session.TenantID != tenantID {
		return appresp.Fail(c, http.StatusUnauthorized, "kiosk_forbidden")
	}

	// A cancelled session must reject kiosk access even with a valid token.
	if s.Session.Status == entity.SessionCancelled {
		return appresp.Fail(c, http.StatusUnauthorized, "kiosk_cancelled")
	}

	// Self-heal: sessions created before substage cloning (or whose clone was
	// skipped) have no session_substages, leaving the kiosk empty. Clone the
	// Kegiatan leaves now (idempotent) so content renders. Failure is
	// non-fatal — the kiosk still shows whatever stages/substages exist.
	if err := h.sessionUC.EnsureSessionSubstages((*c).Request().Context(), id); err != nil {
		log.Printf("kiosk: ensure session_substages failed for %s: %v", id, err)
	}

	// Per stage, load each instantiated Kegiatan (session_substage) with its
	// per-Kegiatan content (content now lives on the program_substage leaf).
	// Falls back to an empty substage list when substage cloning has not run.
	// When the kiosk identifies its group, derive per-substage lock state from
	// the group's live progress. The group must belong to this session; otherwise
	// it is a forbidden cross-session access.
	var progressBySubstage map[string]entity.GroupStageProgressStatus
	if groupId != "" {
		g, gErr := h.liveRepo.GetGroup((*c).Request().Context(), groupId)
		if gErr != nil || g.SessionID != s.Session.ID {
			return appresp.Fail(c, http.StatusUnauthorized, "kiosk_forbidden")
		}
		prog, pErr := h.liveRepo.GetProgressByGroup((*c).Request().Context(), groupId)
		if pErr != nil {
			return apperrors.Internal("internal_error", pErr)
		}
		progressBySubstage = make(map[string]entity.GroupStageProgressStatus, len(prog))
		for i := range prog {
			progressBySubstage[prog[i].SessionSubstageID] = prog[i].Status
		}
	}

	stages := make([]kioskStageContent, 0, len(s.Stages))
	for i := range s.Stages {
		ksc := kioskStageContent{Stage: s.Stages[i], Substages: []kioskSubstageContent{}}
		if h.substageRepo != nil {
			subs, subErr := h.substageRepo.ListSessionSubstages((*c).Request().Context(), s.Session.ID)
			if subErr == nil {
				for j := range subs {
					if subs[j].SessionStageID != s.Stages[i].ID {
						continue
					}
					contents, listErr := h.contentRepo.ListStageContents((*c).Request().Context(), subs[j].ProgramSubstageID)
					if listErr != nil {
						// Contents are non-critical for kiosk display.
						contents = []entity.StageContent{}
					}
					ks := kioskSubstage(subs[j])
					ks.Contents = contents
					if st, ok := progressBySubstage[subs[j].ID]; ok && st == entity.ProgressLocked {
						ks.Locked = true
						ks.Contents = []entity.StageContent{}
					}
					ksc.Substages = append(ksc.Substages, ks)
				}
			}
		}
		stages = append(stages, ksc)
	}

	return appresp.OK(c, &kioskResponse{Session: toKioskSessionDTO(s.Session), Stages: stages, GroupID: groupId})
}

package handler

import (
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
}

// NewKioskHandler builds the kiosk handler.
func NewKioskHandler(authUC *auth.Usecase, sessionUC *usecase.SessionUsecase, contentRepo repository.ContentRepository, substageRepo repository.SessionSubstageRepository) *KioskHandler {
	return &KioskHandler{authUC: authUC, sessionUC: sessionUC, contentRepo: contentRepo, substageRepo: substageRepo}
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

	// Per stage, load each instantiated Kegiatan (session_substage) with its
	// per-Kegiatan content (content now lives on the program_substage leaf).
	// Falls back to an empty substage list when substage cloning has not run.
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
					ksc.Substages = append(ksc.Substages, ks)
				}
			}
		}
		stages = append(stages, ksc)
	}

	return appresp.OK(c, &kioskResponse{Session: toKioskSessionDTO(s.Session), Stages: stages})
}

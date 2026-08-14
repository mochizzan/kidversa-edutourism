package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/usecase"
)

// KioskHandler serves the public, token-protected learner kiosk access endpoint.
type KioskHandler struct {
	authUC      *auth.Usecase
	sessionUC   *usecase.SessionUsecase
	programRepo repository.ProgramRepository
}

// NewKioskHandler builds the kiosk handler.
func NewKioskHandler(authUC *auth.Usecase, sessionUC *usecase.SessionUsecase, programRepo repository.ProgramRepository) *KioskHandler {
	return &KioskHandler{authUC: authUC, sessionUC: sessionUC, programRepo: programRepo}
}

// kioskStageContent bundles a session stage with its program stage contents.
type kioskStageContent struct {
	Stage    entity.SessionStage   `json:"stage"`
	Contents []entity.StageContent `json:"contents"`
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
// The kiosk token (not a JWT) is the sole authorization. On success it validates the
// token (single-use, unexpired), confirms the token's session+tenant binding matches the
// requested session, then returns the session detail (stages + program contents) and
// consumes the token so it cannot be reused. Invalid/expired/consumed tokens return 401/404.
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
		// Invalid / expired / consumed tokens are indistinguishable to the kiosk UI.
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
		return appresp.Fail(c, http.StatusUnauthorized, "kiosk_invalid")
	}

	// Per stage, load program stage contents.
	stages := make([]kioskStageContent, 0, len(s.Stages))
	for i := range s.Stages {
		contents, listErr := h.programRepo.ListContents((*c).Request().Context(), s.Stages[i].ProgramStageID)
		if listErr != nil {
			// Contents are non-critical for kiosk display; fall back to empty.
			contents = nil
		}
		stages = append(stages, kioskStageContent{Stage: s.Stages[i], Contents: contents})
	}

	// Consume the single-use kiosk token so it cannot be reused.
	if err := h.authUC.ConsumeKioskToken((*c).Request().Context(), token); err != nil {
		return appresp.Fail(c, http.StatusUnauthorized, "kiosk_invalid")
	}

	return appresp.OK(c, &kioskResponse{Session: toKioskSessionDTO(s.Session), Stages: stages})
}

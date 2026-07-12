package handler

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// UserHandler serves /api/users/*.
type UserHandler struct {
	userUC   *auth.UserUsecase
	tenantUC *auth.TenantUsecase
	jwt      *auth.JWTManager
}

// NewUserHandler builds the user handler.
func NewUserHandler(userUC *auth.UserUsecase, jwt *auth.JWTManager) *UserHandler {
	return &UserHandler{userUC: userUC, jwt: jwt}
}

// actorRoleTenant extracts the caller's role + tenant from the JWT context.
func actor(c *echo.Context) (string, string) {
	role, _ := (*c).Get(appmiddleware.CtxRole).(string)
	tid, _ := (*c).Get(appmiddleware.CtxTenantID).(string)
	return role, tid
}

// validateID parses the :id path param; returns error via response if invalid.
func validateID(c *echo.Context) (string, bool) {
	id := (*c).Param("id")
	if _, err := uuid.Parse(id); err != nil {
		_ = appresp.Fail(c, http.StatusBadRequest, "bad_request")
		return "", false
	}
	return id, true
}

// List handles GET /api/users (paginated + filtered).
func (h *UserHandler) List(c *echo.Context) error {
	role, tid := actor(c)
	page, _ := strconv.Atoi((*c).QueryParam("page"))
	limit, _ := strconv.Atoi((*c).QueryParam("limit"))
	f := repository.UserFilter{
		Search:         (*c).QueryParam("search"),
		Role:           (*c).QueryParam("role"),
		ApprovalStatus: (*c).QueryParam("approval_status"),
		TenantID:       (*c).QueryParam("tenant_id"),
	}
	if isActive := (*c).QueryParam("is_active"); isActive != "" {
		b, err := strconv.ParseBool(isActive)
		if err == nil {
			f.IsActive = &b
		}
	}
	res, err := h.userUC.ListUsers((*c).Request().Context(), f, page, limit, role, tid)
	if err != nil {
		return err
	}
	return appresp.OKWithMeta(c, res.Items, &appresp.Meta{Page: page, Limit: limit, Total: res.Total})
}

// Create handles POST /api/users.
func (h *UserHandler) Create(c *echo.Context) error {
	var req dto.CreateUserRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	role, tid := actor(c)
	user, err := h.userUC.CreateUser((*c).Request().Context(), req.Email, req.Password, req.Name, req.Phone, req.TenantID, req.Role, role, tid)
	if err != nil {
		return err
	}
	return appresp.Created(c, user)
}

// Get handles GET /api/users/:id.
func (h *UserHandler) Get(c *echo.Context) error {
	id, ok := validateID(c)
	if !ok {
		return nil
	}
	role, tid := actor(c)
	user, err := h.userUC.GetUser((*c).Request().Context(), id, role, tid)
	if err != nil {
		return err
	}
	return appresp.OK(c, user)
}

// Update handles PUT /api/users/:id.
func (h *UserHandler) Update(c *echo.Context) error {
	id, ok := validateID(c)
	if !ok {
		return nil
	}
	var req dto.UpdateUserRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	role, tid := actor(c)
	user, err := h.userUC.UpdateUser((*c).Request().Context(), id, req.Name, req.Phone, req.Role, req.IsActive, role, tid)
	if err != nil {
		return err
	}
	return appresp.OK(c, user)
}

// Approve handles POST /api/users/:id/approve.
func (h *UserHandler) Approve(c *echo.Context) error {
	id, ok := validateID(c)
	if !ok {
		return nil
	}
	uid := appmiddleware.GetUserID(c)
	user, err := h.userUC.ApproveUser((*c).Request().Context(), id, uid)
	if err != nil {
		return err
	}
	return appresp.OK(c, user)
}

// Reject handles POST /api/users/:id/reject.
func (h *UserHandler) Reject(c *echo.Context) error {
	id, ok := validateID(c)
	if !ok {
		return nil
	}
	var req dto.RejectUserRequest
	_ = (*c).Bind(&req)
	uid := appmiddleware.GetUserID(c)
	user, err := h.userUC.RejectUser((*c).Request().Context(), id, uid, req.Reason)
	if err != nil {
		return err
	}
	return appresp.OK(c, user)
}

// Deactivate handles POST /api/users/:id/deactivate.
func (h *UserHandler) Deactivate(c *echo.Context) error {
	id, ok := validateID(c)
	if !ok {
		return nil
	}
	user, err := h.userUC.DeactivateUser((*c).Request().Context(), id)
	if err != nil {
		return err
	}
	return appresp.OK(c, user)
}

// Delete handles DELETE /api/users/:id.
func (h *UserHandler) Delete(c *echo.Context) error {
	id, ok := validateID(c)
	if !ok {
		return nil
	}
	role, tid := actor(c)
	if err := h.userUC.DeleteUser((*c).Request().Context(), id, role, tid); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

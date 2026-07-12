package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	"kidversa-edutourism-backend/internal/domain/entity"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
)

// AuthHandler serves /api/auth/*.
type AuthHandler struct {
	authUC     *auth.Usecase
	jwt        *auth.JWTManager
	cookieName string
	cookieSecure bool
	cookieSameSite string
}

// NewAuthHandler builds the auth handler.
func NewAuthHandler(uc *auth.Usecase, jwt *auth.JWTManager, cookieName string, cookieSecure bool, cookieSameSite string) *AuthHandler {
	return &AuthHandler{authUC: uc, jwt: jwt, cookieName: cookieName, cookieSecure: cookieSecure, cookieSameSite: cookieSameSite}
}

// Login handles POST /api/auth/login and sets the SSE session cookie.
func (h *AuthHandler) Login(c *echo.Context) error {
	var req dto.LoginRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	res, err := h.authUC.Login((*c).Request().Context(), req.Email, req.Password)
	if err != nil {
		return appresp.Fail(c, http.StatusUnauthorized, "invalid_credentials")
	}
	setSessionCookie(c, h.cookieName, res.AccessToken, h.cookieSecure, h.cookieSameSite, int(h.jwt.AccessTTL().Seconds()))
	return appresp.OK(c, &dto.LoginResponse{AccessToken: res.AccessToken, RefreshToken: res.RefreshToken, User: res.User})
}

// Register handles POST /api/auth/register (self-service, pending).
func (h *AuthHandler) Register(c *echo.Context) error {
	var req dto.RegisterRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	tenantID := req.TenantID
	var tenantPtr *string
	if tenantID != "" {
		tenantPtr = &tenantID
	}
	user, err := h.authUC.Register((*c).Request().Context(), req.Name, req.Email, req.Phone, tenantPtr, req.Role, req.Password)
	if err != nil {
		return err
	}
	return appresp.Created(c, user)
}

// Refresh handles POST /api/auth/refresh (rotates tokens).
func (h *AuthHandler) Refresh(c *echo.Context) error {
	var req dto.RefreshRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	res, err := h.authUC.Refresh((*c).Request().Context(), req.RefreshToken)
	if err != nil {
		return appresp.Fail(c, http.StatusUnauthorized, "token_invalid")
	}
	return appresp.OK(c, &dto.LoginResponse{AccessToken: res.AccessToken, RefreshToken: res.RefreshToken, User: res.User})
}

// Me handles GET /api/auth/me.
func (h *AuthHandler) Me(c *echo.Context) error {
	uid := appmiddleware.GetUserID(c)
	if uid == "" {
		return appresp.Fail(c, http.StatusUnauthorized, "unauthorized")
	}
	// The user is set by JWT middleware via claims; reuse it if present.
	if claims, ok := (*c).Get(appmiddleware.CtxClaims).(*auth.Claims); ok && claims != nil {
		var tptr *string
		if claims.TenantID != "" {
			tptr = &claims.TenantID
		}
		// Return minimal public user from claims (full record fetched by callers needing it).
		return appresp.OK(c, &dto.MeResponse{User: &entity.User{
			BaseModel: entity.BaseModel{ID: claims.UserID},
			TenantID:  tptr,
			Role:      entity.UserRole(claims.Role),
		}})
	}
	return appresp.Fail(c, http.StatusUnauthorized, "unauthorized")
}

// Logout handles POST /api/auth/logout.
func (h *AuthHandler) Logout(c *echo.Context) error {
	var req dto.RefreshRequest
	_ = (*c).Bind(&req)
	if claims, ok := (*c).Get(appmiddleware.CtxClaims).(*auth.Claims); ok && claims != nil {
		_ = h.authUC.Logout((*c).Request().Context(), req.RefreshToken, claims.ID, h.jwt.AccessTTL())
	}
	clearSessionCookie(c, h.cookieName)
	return appresp.NoContent(c)
}

// ChangePassword handles POST /api/auth/change-password.
func (h *AuthHandler) ChangePassword(c *echo.Context) error {
	var req dto.ChangePasswordRequest
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	uid := appmiddleware.GetUserID(c)
	if uid == "" {
		return appresp.Fail(c, http.StatusUnauthorized, "unauthorized")
	}
	if err := h.authUC.ChangePassword((*c).Request().Context(), uid, req.OldPassword, req.NewPassword); err != nil {
		return err
	}
	return appresp.NoContent(c)
}

func setSessionCookie(c *echo.Context, name, token string, secure bool, sameSite string, maxAge int) {
	http.SetCookie((*c).Response().(http.ResponseWriter), &http.Cookie{
		Name:     name,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: parseSameSite(sameSite),
		MaxAge:   maxAge,
	})
}

func clearSessionCookie(c *echo.Context, name string) {
	http.SetCookie((*c).Response().(http.ResponseWriter), &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
}

func parseSameSite(s string) http.SameSite {
	switch s {
	case "None":
		return http.SameSiteNoneMode
	case "Strict":
		return http.SameSiteStrictMode
	default:
		return http.SameSiteLaxMode
	}
}

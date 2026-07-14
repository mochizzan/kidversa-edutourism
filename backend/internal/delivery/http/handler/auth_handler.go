package handler

import (
	"log"
	"net/http"
	"time"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/delivery/http/dto"
	appmiddleware "kidversa-edutourism-backend/internal/delivery/http/middleware"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// AuthHandler serves /api/auth/*.
type AuthHandler struct {
	authUC            *auth.Usecase
	jwt               *auth.JWTManager
	cookieName        string
	refreshCookieName string
	cookieSecure      bool
	cookieSameSite    string
}

// kioskTokenTTL is the lifetime of an issued kiosk token. Kept as a named const
// (not yet configurable) so the value has a single source of truth.
const kioskTokenTTL = 4 * time.Hour

// NewAuthHandler builds the auth handler.
func NewAuthHandler(uc *auth.Usecase, jwt *auth.JWTManager, cookieName string, refreshCookieName string, cookieSecure bool, cookieSameSite string) *AuthHandler {
	return &AuthHandler{authUC: uc, jwt: jwt, cookieName: cookieName, refreshCookieName: refreshCookieName, cookieSecure: cookieSecure, cookieSameSite: cookieSameSite}
}

// Login handles POST /api/auth/login and sets the SSE session cookie.
func (h *AuthHandler) Login(c *echo.Context) error {
	var req dto.LoginRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	res, err := h.authUC.Login((*c).Request().Context(), req.Email, req.Password)
	if err != nil {
		return appresp.Fail(c, http.StatusUnauthorized, "invalid_credentials")
	}
	setSessionCookie(c, h.cookieName, res.AccessToken, h.cookieSecure, h.cookieSameSite, int(h.jwt.AccessTTL().Seconds()))
	setRefreshCookie(c, h.refreshCookieName, res.RefreshToken, h.cookieSecure, h.cookieSameSite, int(h.jwt.RefreshTTL().Seconds()))
	return appresp.OK(c, &dto.LoginResponse{AccessToken: res.AccessToken, RefreshToken: res.RefreshToken, User: res.User})
}

// Register handles POST /api/auth/register (self-service, pending).
func (h *AuthHandler) Register(c *echo.Context) error {
	var req dto.RegisterRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
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

// Refresh handles POST /api/auth/refresh (rotates tokens via HttpOnly refresh cookie).
func (h *AuthHandler) Refresh(c *echo.Context) error {
	ck, err := (*c).Cookie(h.refreshCookieName)
	if err != nil || ck.Value == "" {
		return appresp.Fail(c, http.StatusUnauthorized, "token_invalid")
	}
	res, err := h.authUC.Refresh((*c).Request().Context(), ck.Value)
	if err != nil {
		clearRefreshCookie(c, h.refreshCookieName)
		return appresp.Fail(c, http.StatusUnauthorized, "token_invalid")
	}
	setSessionCookie(c, h.cookieName, res.AccessToken, h.cookieSecure, h.cookieSameSite, int(h.jwt.AccessTTL().Seconds()))
	setRefreshCookie(c, h.refreshCookieName, res.RefreshToken, h.cookieSecure, h.cookieSameSite, int(h.jwt.RefreshTTL().Seconds()))
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
		// Return minimal public user from claims. The frontend (/auth/me in
		// authStore) uses this endpoint only to validate the session cookie — it
		// does NOT read email/name from this response (they come from the stored
		// user record), so exposing only ID/TenantID/Role keeps the payload small
		// and avoids leaking PII. Extend here if the FE starts consuming more fields.
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
	if err := (*c).Bind(&req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if claims, ok := (*c).Get(appmiddleware.CtxClaims).(*auth.Claims); ok && claims != nil {
		if err := h.authUC.Logout((*c).Request().Context(), req.RefreshToken, claims.ID, h.jwt.AccessTTL()); err != nil {
			log.Printf("auth: logout revoke failed: %v", err)
		}
	}
	clearRefreshCookie(c, h.refreshCookieName)
	clearSessionCookie(c, h.cookieName)
	return appresp.NoContent(c)
}

// IssueKiosk handles POST /api/auth/kiosk (JWT-protected). It issues a single-use
// kiosk token bound to the requested session (within the caller's tenant scope).
func (h *AuthHandler) IssueKiosk(c *echo.Context) error {
	var req dto.KioskTokenRequest
	if err := bindAndValidate(c, &req); err != nil {
		return err
	}
	tenantID := appmiddleware.GetTenantID(c)
	if tenantID == "" {
		return appresp.Fail(c, http.StatusBadRequest, "tenant_required")
	}
	token, err := h.authUC.IssueKioskToken((*c).Request().Context(), req.SessionID, tenantID, kioskTokenTTL)
	if err != nil {
		return err
	}
	return appresp.OK(c, map[string]string{"token": token})
}

// setSessionCookie / setRefreshCookie issue the auth cookies. These MUST be
// sent on cross-origin credentialed requests (the SPA origin differs from the
// API origin, e.g. :5173 → :8080), so they require SameSite=None. The None
// mode mandates the Secure attribute; browsers treat http://localhost as a
// secure context, so Secure cookies are stored and sent there too (and HTTPS
// in production requires it anyway). We therefore ignore the configurable
// secure/sameSite values for these auth cookies — Lax/Strict would silently
// break the refresh-on-reload flow because the cookie would not be attached
// to the cross-origin fetch to /api/auth/refresh.
func setSessionCookie(c *echo.Context, name, token string, _ bool, _ string, maxAge int) {
	http.SetCookie((*c).Response().(http.ResponseWriter), &http.Cookie{
		Name:     name,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
		MaxAge:   maxAge,
	})
}

func clearSessionCookie(c *echo.Context, name string) {
	http.SetCookie((*c).Response().(http.ResponseWriter), &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
		MaxAge:   -1,
	})
}

func setRefreshCookie(c *echo.Context, name, token string, _ bool, _ string, maxAge int) {
	http.SetCookie((*c).Response().(http.ResponseWriter), &http.Cookie{
		Name:     name,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
		MaxAge:   maxAge,
	})
}

func clearRefreshCookie(c *echo.Context, name string) {
	http.SetCookie((*c).Response().(http.ResponseWriter), &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
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

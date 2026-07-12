package middleware

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"

	"kidversa-edutourism-backend/internal/infrastructure/auth"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// contextKeys for values set by middleware.
const (
	CtxUserID   = "user_id"
	CtxTenantID = "tenant_id"
	CtxRole     = "role"
	CtxClaims   = "claims"
)

// JWTAuth validates the Bearer access token (or the SSE cookie) and sets claims on the context.
// When sseCookieName is non-empty and the Authorization header is absent, it reads the
// httpOnly cookie (used by SSE streams, since EventSource cannot set headers).
//
// revoker is the optional jti denylist (logout/password-change revocation). When non-nil,
// a token whose jti is on the denylist is rejected with 401 "token_revoked".
func JWTAuth(jm *auth.JWTManager, sseCookieName string, revoker auth.TokenRevoker) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			tokenStr := extractToken(c, sseCookieName)
			if tokenStr == "" {
				return appresp.Fail(c, http.StatusUnauthorized, "unauthorized")
			}
			claims, err := jm.Parse(tokenStr)
			if err != nil {
				return appresp.Fail(c, http.StatusUnauthorized, "token_invalid")
			}
			// Revocation check: denylist jti (logout / password change invalidates the token).
			if revoker != nil && revoker.IsRevoked((*c).Request().Context(), claims.ID) {
				return appresp.Fail(c, http.StatusUnauthorized, "token_revoked")
			}
			(*c).Set(CtxUserID, claims.UserID)
			(*c).Set(CtxTenantID, claims.TenantID)
			(*c).Set(CtxRole, claims.Role)
			(*c).Set(CtxClaims, claims)
			return next(c)
		}
	}
}

func extractToken(c *echo.Context, sseCookieName string) string {
	authz := (*c).Request().Header.Get(echo.HeaderAuthorization)
	if strings.HasPrefix(authz, "Bearer ") {
		return strings.TrimPrefix(authz, "Bearer ")
	}
	if sseCookieName != "" {
		if ck, err := (*c).Cookie(sseCookieName); err == nil {
			return ck.Value
		}
	}
	return ""
}

// RequireRole restricts access to the given roles. Must run after JWTAuth.
func RequireRole(roles ...string) echo.MiddlewareFunc {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			role, _ := (*c).Get(CtxRole).(string)
			if !allowed[role] {
				return appresp.Fail(c, http.StatusForbidden, "forbidden")
			}
			return next(c)
		}
	}
}

// TenantScope enforces tenant isolation. For SUPER_ADMIN the X-Tenant-Id header is honored
// (and required); for other roles the JWT tenant_id is the only scope and any X-Tenant-Id
// header is ignored (and rejected if present for non-SA).
func TenantScope() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			role, _ := (*c).Get(CtxRole).(string)
			claimsTenant, _ := (*c).Get(CtxTenantID).(string)
			headerTenant := (*c).Request().Header.Get("X-Tenant-Id")

			if role == "SUPER_ADMIN" {
				if headerTenant != "" {
					(*c).Set(CtxTenantID, headerTenant)
					return next(c)
				}
				// SUPER_ADMIN without a selected tenant cannot access scoped data.
				if claimsTenant == "" {
					return appresp.Fail(c, http.StatusBadRequest, "tenant_required")
				}
				return next(c)
			}

			// Non-SA: drop illegal header, scope strictly from JWT.
			if headerTenant != "" {
				return appresp.Fail(c, http.StatusUnauthorized, "unauthorized")
			}
			if claimsTenant == "" {
				return appresp.Fail(c, http.StatusBadRequest, "tenant_required")
			}
			return next(c)
		}
	}
}

// GetTenantID extracts the resolved tenant id from context ("" if none).
func GetTenantID(c *echo.Context) string {
	t, _ := (*c).Get(CtxTenantID).(string)
	return t
}

// GetUserID extracts the resolved user id from context.
func GetUserID(c *echo.Context) string {
	u, _ := (*c).Get(CtxUserID).(string)
	return u
}

// ensure apperrors import used (kept for future expansion / explicit error mapping).
var _ = apperrors.Internal

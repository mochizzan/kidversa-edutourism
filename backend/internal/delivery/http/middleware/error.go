package middleware

import (
	"log"
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"

	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// ErrorHandler normalizes all errors/panics into the standard JSON envelope.
// It must be registered as the outermost HTTPErrorHandler.
func ErrorHandler(c *echo.Context, err error) {
	status := http.StatusInternalServerError
	code := "internal_error"
	msg := appresp.MessageForCode(code)

	switch e := err.(type) {
	case *echo.HTTPError:
		status = e.Code
		switch status {
		case http.StatusNotFound:
			code = "not_found"
		case http.StatusMethodNotAllowed:
			code = "bad_request"
		case http.StatusUnauthorized:
			code = "unauthorized"
		case http.StatusForbidden:
			code = "forbidden"
		case http.StatusBadRequest:
			code = "bad_request"
		default:
			code = "internal_error"
		}
		if e.Message != "" {
			msg = e.Message
		}
	default:
		if ae, ok := err.(*apperrors.AppError); ok {
			status = ae.StatusCode()
			code = ae.CodeName()
			msg = appresp.MessageForCode(code)
		}
	}
	if err := appresp.FailMsg(c, status, code, msg); err != nil {
		log.Printf("middleware: failed to write error response: %v", err)
	}
}

// CORS builds the CORS middleware with an explicit allowlist (never "*").
func CORS(allowedOrigins []string) echo.MiddlewareFunc {
	return middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization, "X-Tenant-Id", "X-Report-Token"},
		AllowCredentials: true,
		ExposeHeaders:    []string{"X-Accel-Buffering"},
		MaxAge:           86400,
	})
}

package handler

import (
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"

	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// bindUUID pulls a path param, validates it is a UUID, and responds 400 if not.
// Returns (id, true) on success.
func bindUUID(c *echo.Context, name string) (string, bool) {
	v := (*c).Param(name)
	if v == "" || uuid.Validate(v) != nil {
		if err := appresp.Fail(c, http.StatusBadRequest, "invalid_body"); err != nil {
			log.Printf("handler: failed to write bindUUID error: %v", err)
		}
		return "", false
	}
	return v, true
}

// bindAndValidate binds the request body into req and validates it, writing the
// standard error envelope on failure. It returns a non-nil error to short-circuit
// the handler (e.g. `if err := bindAndValidate(c, &req); err != nil { return err }`).
func bindAndValidate(c *echo.Context, req interface{}) error {
	if err := (*c).Bind(req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "invalid_body")
	}
	if err := (*c).Validate(req); err != nil {
		return appresp.Fail(c, http.StatusBadRequest, "validation_error")
	}
	return nil
}

// queryInt reads a query param as int with a default.
func queryInt(c *echo.Context, name string, def int) int {
	v := (*c).QueryParam(name)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

// pagination extracts page/limit from the query, clamped to safe bounds.
func pagination(c *echo.Context) (page, limit int) {
	page = queryInt(c, "page", 1)
	limit = queryInt(c, "limit", 20)
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	return page, limit
}

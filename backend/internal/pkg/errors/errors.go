package errors

import (
	"errors"
	"net/http"
)

// AppError is the canonical application error carrying an HTTP status and a stable error code.
type AppError struct {
	Status int
	Code   string
	Err    error
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return e.Err.Error()
	}
	return e.Code
}

func (e *AppError) Unwrap() error { return e.Err }

// StatusCode exposes the HTTP status (used by middleware to extract the code).
func (e *AppError) StatusCode() int { return e.Status }

// CodeName exposes the stable error code.
func (e *AppError) CodeName() string { return e.Code }

// New builds an AppError.
func New(status int, code string, err error) *AppError {
	return &AppError{Status: status, Code: code, Err: err}
}

// Common constructors.
func BadRequest(code string, err error) *AppError { return New(http.StatusBadRequest, code, err) }
func Unauthorized(code string, err error) *AppError {
	return New(http.StatusUnauthorized, code, err)
}
func Forbidden(code string, err error) *AppError { return New(http.StatusForbidden, code, err) }
func NotFound(code string, err error) *AppError  { return New(http.StatusNotFound, code, err) }
func Conflict(code string, err error) *AppError  { return New(http.StatusConflict, code, err) }
func Internal(code string, err error) *AppError  { return New(http.StatusInternalServerError, code, err) }

// AsAppError attempts to extract an *AppError from err, returning the status and code.
func AsAppError(err error) (status int, code string, ok bool) {
	var ae *AppError
	if errors.As(err, &ae) {
		return ae.Status, ae.Code, true
	}
	return http.StatusInternalServerError, "internal_error", false
}

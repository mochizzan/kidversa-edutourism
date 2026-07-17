package response

import (
	"net/http"

	"github.com/labstack/echo/v5"
)

// Envelope is the standard JSON response wrapper used by every endpoint.
type Envelope struct {
	Data  interface{} `json:"data,omitempty"`
	Meta  *Meta       `json:"meta,omitempty"`
	Error *ErrorInfo  `json:"error,omitempty"`
}

// Meta carries pagination information for list endpoints.
type Meta struct {
	Page  int `json:"page"`
	Limit int `json:"limit"`
	Total int `json:"total"`
}

// ErrorInfo is the structured error payload.
type ErrorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// OK writes a 200 response with data.
func OK(c *echo.Context, data interface{}) error {
	return (*c).JSON(http.StatusOK, Envelope{Data: data})
}

// OKWithMeta writes a 200 response with data and pagination meta.
func OKWithMeta(c *echo.Context, data interface{}, meta *Meta) error {
	return (*c).JSON(http.StatusOK, Envelope{Data: data, Meta: meta})
}

// Created writes a 201 response with data.
func Created(c *echo.Context, data interface{}) error {
	return (*c).JSON(http.StatusCreated, Envelope{Data: data})
}

// Accepted writes a 202 response (async work accepted).
func Accepted(c *echo.Context) error {
	return (*c).NoContent(http.StatusAccepted)
}

// AcceptedWithData writes a 202 response with data (async work accepted).
func AcceptedWithData(c *echo.Context, data interface{}) error {
	return (*c).JSON(http.StatusAccepted, Envelope{Data: data})
}

// NoContent writes a 204 response.
func NoContent(c *echo.Context) error {
	return (*c).NoContent(http.StatusNoContent)
}

// Fail writes a status with a registered error code (message resolved from the code).
func Fail(c *echo.Context, status int, code string) error {
	return (*c).JSON(status, Envelope{Error: &ErrorInfo{Code: code, Message: MessageForCode(code)}})
}

// FailMsg writes a status with an explicit code and message.
func FailMsg(c *echo.Context, status int, code, msg string) error {
	return (*c).JSON(status, Envelope{Error: &ErrorInfo{Code: code, Message: msg}})
}

// MessageForCode returns a human-readable Indonesian message for a known error code.
func MessageForCode(code string) string {
	switch code {
	case "invalid_body":
		return "Format permintaan tidak valid"
	case "validation_error":
		return "Data tidak valid"
	case "invalid_credentials":
		return "Email atau kata sandi salah"
	case "unauthorized":
		return "Tidak memiliki akses"
	case "forbidden":
		return "Akses ditolak"
	case "not_found":
		return "Data tidak ditemukan"
	case "conflict":
		return "Data sudah ada atau bentrok"
	case "token_expired":
		return "Token telah kadaluarsa"
	case "token_invalid":
		return "Token tidak valid"
	case "tenant_required":
		return "Tenant aktif belum dipilih"
	case "session_not_deletable":
		return "Sesi tidak dapat dihapus"
	case "participant_not_deletable":
		return "Peserta tidak dapat dihapus"
	case "file_type_blocked":
		return "Tipe berkas diblokir"
	case "consent_required":
		return "Persetujuan orang tua diperlukan"
	case "invalid_file":
		return "Berkas tidak valid"
	case "token_revoked":
		return "Token telah dicabut"
	case "token_required":
		return "Token diperlukan"
	case "kiosk_invalid":
		return "Token kiosk tidak valid"
	case "bad_request":
		return "Permintaan tidak dapat diproses"
	case "internal_error":
		return "Terjadi kesalahan pada server"
	default:
		return "Terjadi kesalahan"
	}
}

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
	case "participant_duplicate_name":
		return "Nama peserta sudah digunakan"
	case "session_not_editable":
		return "Sesi sudah tidak dapat diubah"
	case "participant_already_in_session":
		return "Peserta sudah berada di sesi ini"
	case "invalid_group":
		return "Kelompok tidak valid atau bukan milik sesi ini"
	case "group_full":
		return "Kelompok sudah penuh (maksimal 20 peserta)"
	case "already_generating":
		return "Laporan untuk sesi ini sedang dibuat. Tunggu hingga proses selesai."
	case "send_in_progress":
		return "Laporan ini sedang dikirim. Tunggu hingga proses pengiriman selesai."
	case "already_sent":
		return "Permintaan consent sudah dikirimkan sebelumnya."
	case "already_consented":
		return "Peserta ini sudah memberikan persetujuan."
	case "content_tenant_mismatch":
		return "Konten ini bukan milik tenant aktif."
	case "self_role_change_not_allowed":
		return "Anda tidak dapat mengubah peran Anda sendiri."
	case "file_type_blocked":
		return "Tipe berkas diblokir"
	case "invalid_file":
		return "file kosong"
	case "file_type_unsupported":
		return "Tipe berkas tidak diizinkan"
	case "consent_required":
		return "Persetujuan orang tua diperlukan"
	case "token_revoked":
		return "Token telah dicabut"
	case "token_required":
		return "Token diperlukan"
	case "kiosk_invalid":
		return "Token kiosk tidak valid"
	case "kiosk_expired":
		return "Tautan kiosk telah kedaluwarsa"
	case "kiosk_cancelled":
		return "Sesi kiosk telah dibatalkan"
	case "bad_request":
		return "Permintaan tidak dapat diproses"
	case "schema_drift":
		return "Terjadi kesalahan pada struktur database. Hubungi administrator."
	case "internal_error":
		return "Terjadi kesalahan pada server"
	case "facilitator_required":
		return "Setiap kelompok harus memiliki fasilitator"
	case "invalid_facilitator":
		return "Fasilitator tidak valid atau tidak ditemukan"
	case "no_groups":
		return "Sesi harus memiliki minimal satu kelompok"
	case "no_participants":
		return "Setiap kelompok harus memiliki minimal satu peserta"
	case "program_has_no_topics":
		return "Program belum memiliki topik. Tambahkan minimal satu topik beserta kegiatannya sebelum membuat sesi."
	case "topic_has_no_activities":
		return "Masih ada topik yang belum memiliki kegiatan. Lengkapi kegiatan pada setiap topik sebelum membuat sesi."
	case "grading_incomplete":
		return "Terdapat peserta yang hadir namun belum dinilai pada sesi ini"
	case "present_participants_unassessed":
		return "Terdapat peserta yang sudah absen namun belum dinilai. Lengkapi penilaian peserta yang hadir sebelum menyelesaikan kelompok."
	case "group_completed":
		return "Kelompok sudah diselesaikan; kehadiran dan penilaian tidak dapat diubah lagi."
	case "whatsapp_send_failed":
		return "Gagal mengirim rapor via WhatsApp. Silakan coba kirim ulang."
	case "whatsapp_number_missing":
		return "Nomor WhatsApp orang tua tidak tersedia untuk peserta ini"
	case "report_link_not_configured":
		return "Tautan rapor belum dikonfigurasi (PARENT_REPORT_BASE_URL)"
	case "user_not_deactivatable":
		return "Akun ini tidak dapat dinonaktifkan"
	case "user_not_deletable":
		return "Akun ini tidak dapat dihapus"
	default:
		return "Terjadi kesalahan"
	}
}

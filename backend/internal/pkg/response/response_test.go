package response_test

import (
	"testing"

	appresp "kidversa-edutourism-backend/internal/pkg/response"
)

// TestMessageForCode_SessionAndProgramGates pins the backend→frontend contract
// for the audit codes: the FE maps errors.session_not_active /
// errors.program_has_sessions (plus the #3/#19 lifecycle codes below), and the
// backend envelope message must be the stable operational text — never the
// generic "Terjadi kesalahan" fallback.
func TestMessageForCode_SessionAndProgramGates(t *testing.T) {
	fallback := appresp.MessageForCode("__unknown_audit_code__")
	cases := map[string]string{
		"session_not_active":          "Sesi sudah dibatalkan atau tidak aktif — perubahan tidak dapat disimpan.",
		"program_has_sessions":        "Program masih memiliki sesi. Hapus atau pindahkan sesi terlebih dahulu.",
		"session_cancelled_permanent": "Sesi sudah dibatalkan dan tidak dapat diaktifkan kembali.",
		"program_not_found":           "Program terkait sesi ini sudah dihapus — sesi tidak dapat dijalankan.",
	}
	for code, want := range cases {
		got := appresp.MessageForCode(code)
		if got != want {
			t.Errorf("MessageForCode(%q) = %q, want %q", code, got, want)
		}
		if got == fallback {
			t.Errorf("MessageForCode(%q) fell back to the default message %q", code, fallback)
		}
	}
}

package handler

import (
	"strings"
	"testing"
)

// consentExampleURL is the worked-example consent link used by the template
// spec (64-hex token).
const consentExampleURL = "https://app.kidversa.com/consent/respond?token=887834f3acf32edd5bb95a0a577a30bd81c15aedb05a88b37fafed9ce507b9b9"

// requireExactConsentMessage asserts got == want character-for-character (not
// a substring check) and reports the first differing byte on failure.
func requireExactConsentMessage(t *testing.T, got, want string) {
	t.Helper()
	if got == want {
		return
	}
	t.Errorf("message differs from the spec template (got %d bytes, want %d bytes)", len(got), len(want))
	limit := len(got)
	if len(want) < limit {
		limit = len(want)
	}
	for i := range limit {
		if got[i] != want[i] {
			t.Errorf("first difference at byte %d: got %q, want %q", i, got[i], want[i])
			break
		}
	}
	t.Fatalf("got:\n%s\n---\nwant:\n%s", got, want)
}

// TestBuildConsentMessageFullDataExact locks the consent template byte for
// byte against the spec (emoji, bold/italic markers, bullets, separators, and
// no trailing newline).
func TestBuildConsentMessageFullDataExact(t *testing.T) {
	got := buildConsentMessage("Andi Santoso", "Anto", "Event BPBD Pagi", "3 Oktober 2026", "Bandung", consentExampleURL)
	want := `🎓 *KIDVERSA EDUTOURISM*
_Formulir Persetujuan Dokumentasi Kegiatan_

Yth. Bapak/Ibu *Andi Santoso*,

Salam hangat dari Kidversa! 🌟

Dalam rangka mendokumentasikan proses pembelajaran dan aktivitas peserta didik, kami memohon kesediaan serta perizinan Bapak/Ibu terkait pengambilan foto ananda *Anto* selama kegiatan berlangsung.

📌 *DETAIL KEGIATAN*
• *Sesi:* Event BPBD Pagi
• *Tanggal:* 3 Oktober 2026
• *Lokasi:* Bandung

ℹ️ *Maksud & Tujuan Dokumentasi:*
> _Foto yang diambil akan digunakan untuk portofolio perkembangan belajar siswa, laporan kegiatan kepada orang tua, serta dokumentasi resmi Kidversa Edutourism dengan tetap memrioritaskan privasi dan kenyamanan ananda._

✍️ *KONFIRMASI PERSETUJUAN*
Silakan klik tautan di bawah ini untuk memberikan konfirmasi persetujuan Bapak/Ibu:
https://app.kidversa.com/consent/respond?token=887834f3acf32edd5bb95a0a577a30bd81c15aedb05a88b37fafed9ce507b9b9

Atas perhatian, kepercayaan, dan kerja sama Bapak/Ibu, kami ucapkan terima kasih 🙏

---
_Salam hangat,_
*Tim Kidversa Edutourism*`
	requireExactConsentMessage(t, got, want)
}

// TestBuildConsentMessageEmptyDataPlaceholders: every empty field renders its
// placeholder inside the surrounding formatting, so the line structure is
// byte-for-byte identical to the full-data shape (only the values change).
func TestBuildConsentMessageEmptyDataPlaceholders(t *testing.T) {
	got := buildConsentMessage("", "", "", "", "", "")
	want := `🎓 *KIDVERSA EDUTOURISM*
_Formulir Persetujuan Dokumentasi Kegiatan_

Yth. Bapak/Ibu *[tidak tersedia]*,

Salam hangat dari Kidversa! 🌟

Dalam rangka mendokumentasikan proses pembelajaran dan aktivitas peserta didik, kami memohon kesediaan serta perizinan Bapak/Ibu terkait pengambilan foto ananda *[tidak tersedia]* selama kegiatan berlangsung.

📌 *DETAIL KEGIATAN*
• *Sesi:* [tidak tersedia]
• *Tanggal:* [tidak tersedia]
• *Lokasi:* [tidak tersedia]

ℹ️ *Maksud & Tujuan Dokumentasi:*
> _Foto yang diambil akan digunakan untuk portofolio perkembangan belajar siswa, laporan kegiatan kepada orang tua, serta dokumentasi resmi Kidversa Edutourism dengan tetap memrioritaskan privasi dan kenyamanan ananda._

✍️ *KONFIRMASI PERSETUJUAN*
Silakan klik tautan di bawah ini untuk memberikan konfirmasi persetujuan Bapak/Ibu:
[tautan tidak tersedia]

Atas perhatian, kepercayaan, dan kerja sama Bapak/Ibu, kami ucapkan terima kasih 🙏

---
_Salam hangat,_
*Tim Kidversa Edutourism*`
	requireExactConsentMessage(t, got, want)

	// Structure intact: placeholders substitute in place — same line count as
	// the full-data message, and every section header survives.
	gotLines := strings.Count(got, "\n")
	wantLines := strings.Count(buildConsentMessage("Andi Santoso", "Anto", "Event BPBD Pagi", "3 Oktober 2026", "Bandung", consentExampleURL), "\n")
	if gotLines != wantLines {
		t.Errorf("placeholder message has %d newlines, want %d (structure must stay intact)", gotLines, wantLines)
	}
	for _, section := range []string{
		"📌 *DETAIL KEGIATAN*",
		"ℹ️ *Maksud & Tujuan Dokumentasi:*",
		"✍️ *KONFIRMASI PERSETUJUAN*",
	} {
		if !strings.Contains(got, section) {
			t.Errorf("section %q missing from placeholder message", section)
		}
	}
}

package reports

import (
	"strings"
	"testing"
)

// fullMessageData is the worked example for the report template: every field
// present and the four example mission titles (MaxReportMissions cap).
func fullMessageData() reportMessageData {
	return reportMessageData{
		parentName:  "Andi Santoso",
		childName:   "Dewi Lestari",
		sessionName: "Event BPBD Pagi",
		programName: "SIAGA KEBENCANAAN",
		topicName:   "Gempa",
		reportLink:  "https://app.kidversa.com/parent/report?token=979087a67ddf8cf3506278d48dbda29aa0592c4baaf023974119fa8e1a798296",
		galleryLink: "https://app.kidversa.com/gallery?token=3e446b97ee22fd7aa59b60c0c63dc1dded399c654ee39d14a32f214418f18389",
		narrative:   "Dewi Lestari mulai mengenali tanda bahaya gempa dan mampu menunjukkan jalur evakuasi bersama teman-temannya di kelas.",
		missionTitles: []string{
			"Praktikkan jalur evakuasi bersama keluarga",
			"Siapkan tas siaga bencana di rumah",
			"Diskusikan 3 tanda bahaya gempa bersama ananda",
			"Mainkan permainan simulasi gempa di rumah",
		},
	}
}

// requireExactMessage asserts got == want character-for-character (not a
// substring check) and reports the first differing byte on failure.
func requireExactMessage(t *testing.T, got, want string) {
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

// TestBuildReportMessageFullDataExact locks the delivery template byte for
// byte against the spec (including the trailing spaces after
// "Rapor Digital:*" / "Galeri Foto Kegiatan:*" and the absent trailing newline).
func TestBuildReportMessageFullDataExact(t *testing.T) {
	got := buildReportMessage(fullMessageData())
	want := `🎓 *KIDVERSA EDUTOURISM*
_Laporan Perkembangan Peserta Didik_

Yth. Bapak/Ibu *Andi Santoso*,

Salam hangat dari Kidversa! 🌟

Rapor perkembangan ananda *Dewi Lestari* untuk kegiatan edukasi telah selesai diproses dan disetujui.

📌 *DETAIL KEGIATAN*
• *Sesi:* Event BPBD Pagi
• *Program:* SIAGA KEBENCANAAN
• *Topik:* Gempa

🔗 *TAUTAN RAPOR & FOTO KEGIATAN*
• 📄 *Rapor Digital:* 
https://app.kidversa.com/parent/report?token=979087a67ddf8cf3506278d48dbda29aa0592c4baaf023974119fa8e1a798296

• 📸 *Galeri Foto Kegiatan:* 
https://app.kidversa.com/gallery?token=3e446b97ee22fd7aa59b60c0c63dc1dded399c654ee39d14a32f214418f18389

---

📝 *CATATAN PERKEMBANGAN*
> _"Dewi Lestari mulai mengenali tanda bahaya gempa dan mampu menunjukkan jalur evakuasi bersama teman-temannya di kelas."_

🎯 *MISI LANJUTAN DI RUMAH*
• Praktikkan jalur evakuasi bersama keluarga
• Siapkan tas siaga bencana di rumah
• Diskusikan 3 tanda bahaya gempa bersama ananda
• Mainkan permainan simulasi gempa di rumah

---

Mari bersama-sama mendukung tumbuh kembang dan kesiapsiagaan ananda! Jika ada pertanyaan terkait laporan ini, silakan hubungi kami.

Terima kasih atas kepercayaan Bapak/Ibu 🙏`
	requireExactMessage(t, got, want)
}

// TestBuildReportMessageEmptyDataPlaceholders: every empty field renders its
// placeholder in the same position, so the line structure stays intact and
// zero missions yield a single placeholder bullet.
func TestBuildReportMessageEmptyDataPlaceholders(t *testing.T) {
	got := buildReportMessage(reportMessageData{})
	want := `🎓 *KIDVERSA EDUTOURISM*
_Laporan Perkembangan Peserta Didik_

Yth. Bapak/Ibu *[tidak tersedia]*,

Salam hangat dari Kidversa! 🌟

Rapor perkembangan ananda *[tidak tersedia]* untuk kegiatan edukasi telah selesai diproses dan disetujui.

📌 *DETAIL KEGIATAN*
• *Sesi:* [tidak tersedia]
• *Program:* [tidak tersedia]
• *Topik:* [tidak tersedia]

🔗 *TAUTAN RAPOR & FOTO KEGIATAN*
• 📄 *Rapor Digital:* 
[tautan tidak tersedia]

• 📸 *Galeri Foto Kegiatan:* 
[tautan tidak tersedia]

---

📝 *CATATAN PERKEMBANGAN*
> _"[narasi belum tersedia]"_

🎯 *MISI LANJUTAN DI RUMAH*
• [misi belum tersedia]

---

Mari bersama-sama mendukung tumbuh kembang dan kesiapsiagaan ananda! Jika ada pertanyaan terkait laporan ini, silakan hubungi kami.

Terima kasih atas kepercayaan Bapak/Ibu 🙏`
	requireExactMessage(t, got, want)

	// Structure intact: every section header survives.
	for _, section := range []string{
		"📌 *DETAIL KEGIATAN*",
		"🔗 *TAUTAN RAPOR & FOTO KEGIATAN*",
		"📝 *CATATAN PERKEMBANGAN*",
		"🎯 *MISI LANJUTAN DI RUMAH*",
	} {
		if !strings.Contains(got, section) {
			t.Errorf("section %q missing from placeholder message", section)
		}
	}
	// Only the mission block shrinks (4 bullets → 1 placeholder bullet):
	// every other line, blank line, and section boundary is unchanged.
	gotLines := strings.Count(got, "\n")
	wantLines := strings.Count(buildReportMessage(fullMessageData()), "\n") - 3
	if gotLines != wantLines {
		t.Errorf("placeholder message has %d newlines, want %d (structure must stay intact)", gotLines, wantLines)
	}
}

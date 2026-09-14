# Report Review — Misi Lanjutan UX + AI Context Alignment

**Date:** 2026-09-14
**Status:** Approved (option B + chips + tmp verification script)
**Scope:** Frontend UX blok "Misi Lanjutan" + backend konteks AI saran misi (tanpa ubah kontrak API, tanpa migrasi DB)

---

## Problem Statement

Di halaman Review (`/admin/reports/:sessionId/review/:participantId`), blok "Misi Lanjutan" punya dua masalah yang dilaporkan user — satu terbukti benar, satu terbukti keliru dengan akar berbeda:

1. **`Topik: 4138f0c0…` — TERBUKTI, bug UX.**
   `frontend/src/features/admin/components/ReportMissionSelector.tsx:75` me-render
   `Topik: {stageId.slice(0, 8)}…` — potongan UUID `related_stage_ids` langsung ke layar.
   Komponen hanya menerima `missions: MissionBank[]` tanpa peta nama topik, jadi tidak
   bisa menampilkan nama asli. Gruping inline ini juga menduplikasi modal library
   (isi sama persis) sehingga admin bingung memilih di mana.

2. **"System prompt + user prompt disatukan" — TIDAK TERBUKTI.**
   Verifikasi langsung ke kode:
   - Narasi: `narrative_generator.go:208-218` → `loadSystemPrompt()` + `buildUserPrompt()`
     → `ChatCompletion(ctx, systemPrompt, userPrompt)`.
   - Misi: `mission_recommender.go:90-122` → baca `report-missions-system.md` +
     `report-missions-user.md` → `ChatCompletion(llmCtx, systemPrompt, userPrompt)`.
   - Kedua client (`openrouter_client.go:214-217`, `gemini_client.go:buildRequest`)
     memetakan ke `system` / `systemInstruction` + `user` secara terpisah.
   Kelemahan sebenarnya adalah **isi konteksnya yang miskin dan tidak selaras**:
   - Kandidat misi ke LLM hanya `id + title` (`mission_recommender.go:104-108`).
   - Asesmen ke LLM misi hanya `- N bintang — "komentar"` **tanpa nama Kegiatan**
     (baris 109-116), padahal jalur narasi sudah memetakan nama Kegiatan via
     `buildStageBySubstageID` + `buildAssessmentText`. LLM misi buta: tidak tahu
     bintang itu milik kegiatan apa.
   - Narasi dan misi tidak berbagi formatter asesmen → bisa drift.
   - Fallback `suggestHeuristic` no-op: semua skor `0`, hasil akhir hanya urut abjad judul.

## Decisions

| Decision | Choice |
|---|---|
| Scope | B — selaraskan konteks AI + UX chips (bukan A minimal, bukan C full) |
| Tampilan misi terpilih | Chips + tombol Ubah (hapus satu-per-satu via ✕, edit via modal) |
| Penentu kandidat LLM | Otomatis by topik — admin tidak memilih subset kandidat manual |
| Kontrak API `suggestMissions` | Tetap `string[]`, tanpa rationale/observability (YAGNI) |
| Narasi vs misi | Tetap 2 LLM call terpisah |
| Fallback LLM mati | Heuristik deterministik berbasis urutan kurasi, bukan abjad |
| Verifikasi | Gates wajib + smoke manual + skrip `tmp/verify-mission-suggest.mjs` |

---

## Section 1: Tujuan & Prinsip Kandidat

**Satu tujuan utama:** LLM paham *kegiatan mana lemah → misi mana cocok*. Setiap request
saran misi harus membawa: (1) tiap baris asesmen berlabel **nama Kegiatan + bintang +
komentar**, (2) tiap kandidat misi membawa **judul + konteks topiknya**. Tanpa ini LLM
hanya menebak.

**Prinsip kandidat (klarifikasi user, dikunci):**
- Yang dikirim ke LLM **hanya misi yang ter-link ke topik aktif**
  (`mission_bank_stages.program_stage_id = report.program_stage_id`). Misi di luar
  topik **tidak pernah masuk user prompt**. Ini sudah perilaku backend saat ini
  (`mission_recommender.go: SuggestMissions` filter via join `TopicID`) — desain ini
  mempertahankannya secara ketat, bukan menambah baru.
- Penentuan kandidat sepenuhnya otomatis by topik.
- Jaminan anti-bocor: validasi `filterAndTrim` tetap membuang ID di luar kandidat
  (anti-halusinasi), dipartahankan tanpa perubahan perilaku.

**Non-goals:** tidak ubah kontrak API, tidak gabung 2 LLM call, tidak ada logging
prompt/response, print/PDF hanya menyesuaikan render chips menjadi bullet list.

---

## Section 2: UX Blok "Misi Lanjutan"

### Current state

Satu `Card` berisi tombol library + tombol AI + list checkbox yang digrup
`Topik: <uuid-8-char>` + modal library berulang (isi sama dengan list inline).

### New design

- Header `Card` tetap: judul "Misi Lanjutan", subtitle "Pilih maksimal 4 misi untuk
  diberikan kepada orang tua", counter `n/4` di kanan.
- Baris aksi: tombol `Pilih dari library misi` + tombol `Sesuaikan Misi – AI`
  (ikon Sparkles, spinner saat `suggesting`).
- Area terpilih: **chips** — tiap misi terpilih tampil sebagai chip (judul + tombol ✕
  hapus langsung). Kosong → placeholder "Belum ada misi dipilih — pilih dari library
  atau gunakan saran AI."
- Modal library: **satu-satunya tempat memilih manual**. Isi difilter topik aktif
  (pakai `loadTopicMissions(activeTopicId)` yang sudah ada di `useReportReview`,
  fallback ke list program-wide bila gagal). Tiap baris checkbox judul misi + counter
  `n/4`, footer "Selesai". Grup header `Topik: xxx` **dihapus total** — semua isi modal
  sudah pasti satu topik aktif.
- Print: chips di-render ulang sebagai bullet list (`• judul`), menggantikan blok
  `hidden print:block` per-grup yang ada sekarang.

### Dihapus

Grouping `byTopic`/`noTopic` di `ReportMissionSelector.tsx`, label
`Topik: {stageId.slice(0,8)}`, seluruh list checkbox inline.

---

## Section 3: Backend — Konteks Asesmen Bersama

### Current state

Narasi memakai `buildAssessmentText` (nama Kegiatan + bintang + komentar);
misi merakit string sendiri tanpa nama Kegiatan.

### New design

- Ekstrak builder konteks asesmen ke satu fungsi bersama yang dipakai kedua jalur.
  Format tiap baris: `Kegiatan <nama>: <N> bintang [— "<komentar>"]`, diurut stabil,
  baris tanpa sinyal (rating 0 + komentar kosong) dibuang. Narasi: refactor tanpa ubah
  output. Misi (`suggestViaLLM`): adopsi format ini menggantikan format miskinnya.
- Untuk jalur misi, nama Kegiatan diambil dari pemetaan
  `session_substage → program_substage (nama)` yang di-scope ke topik aktif —
  setara dengan `stageInfos` yang sudah ada di frontend, tapi dihitung di backend
  agar LLM menerima nama asli, bukan ID. Rantai resolusi terverifikasi tersedia:
  `Assessment.SessionSubstageID` → `SessionSubstage.ProgramSubstageID` →
  `ProgramSubstage.Name` (via `ProgramSubstageRepository.ListSubstages`, sudah
  di-wire untuk session usecase di `main.go:78`). Namun reports usecase
  (`reportsuc.NewUsecase`) **belum** menerima repo tersebut — implementasi WAJIB
  menambah wiring DI (param repo baru + update call site di `main.go:84`).
  Tanpa ini Bagian 3 tidak bisa jalan.
- Lokasi fungsi builder diputuskan saat plan (natural: paket `reports` atau helper yang
  bisa di-import kedua sisi tanpa melanggar boundary "usecase tidak import `ai`").
- Template `report-missions-user.md` diperbarui: bagian Assessment Data format baru +
  instruksi eksplisit "pilih misi yang menguatkan kegiatan berbintang rendah,
  pertahankan yang sudah kuat".

---

## Section 4: Format Kandidat & System Prompt Misi

### Current state

Kandidat: `- id: <uuid> | judul: <judul>`. Entity `MissionBank` hanya punya `title`
(tanpa deskripsi/kategori — hasil simplify sebelumnya), jadi pengayaan maksimal yang
jujur adalah nama Topik.

### New design

- Tiap baris kandidat: `- id: <id> | misi: "<judul>" (Topik: "<nama topik>")`.
  Karena semua kandidat sudah pasti satu topik aktif, label topik berfungsi sebagai
  jangkar konteks.
- `report-missions-system.md` diperketat: "jangan pernah memilih ID di luar daftar
  kandidat" (memperkuat `filterAndTrim`), "utamakan misi untuk kegiatan berbintang
  1–2, lalu penguat untuk yang sudah kuat", "keluaran hanya JSON array, tanpa prosa".
- `report-missions-user.md` disusun ulang: Anak → Topik/Sesi → Kandidat → Asesmen
  (format baru) → Output.

---

## Section 5: Fallback Heuristik

### Current state

Semua skor `0` → urut abjad judul. Tombol AI saat LLM mati pada dasarnya mengundi abjad.

### New design (deterministik, tanpa LLM, tanpa ubah API)

- Heuristik menjawab "anak ini butuh penguatan (ada N kegiatan lemah)" → pilih misi
  secara stabil mengikuti **urutan kurasi admin** (`sort_order, created_at` — sama
  dengan `List` repo), maksimal 4. Jujur: fallback tidak pura-pura paham semantik,
  tapi menghormati kurasi admin dan konsisten dengan tampilan library.
- Tie-break diganti dari `title ASC` menjadi urutan kurasi agar fallback konsisten
  dengan apa yang admin lihat.
- Bobot kebutuhan (bintang 1 = 3, bintang 2 = 2) dipakai untuk menentukan *berapa
  banyak* misi dikembalikan bila kandidat melimpah; pencocokan kata judul↔kegiatan
  (case-insensitive) dipakai sebagai pemecah urutan sekunder.

---

## Section 6: Error Handling, Testing & File Scope

### Error handling

- LLM gagal / timeout 8 dtk / hasil kosong / semua ID halusinasi → fallback heuristik
  diam-diam (perilaku kini dipertahankan). Toast dibedakan: "Misi AI berhasil
  disarankan" (LLM) vs "Misi disarankan (otomatis)" (fallback) agar admin tahu mana
  hasil AI murni.
- Tanpa kandidat / tanpa topik → toast error seperti sekarang.
- Modal gagal `loadTopicMissions` → fallback list program-wide (tidak kosong).

### Testing

Gates wajib (repo tanpa test suite):
1. `gofmt -l .` kosong, `go vet ./...`, `go build ./...` lolos.
2. `pnpm build` (frontend) lolos.
3. Smoke manual di halaman Review:
   - Tidak ada lagi teks `Topik: xxxx…`.
   - Pilih manual hanya via modal; chips + ✕ + counter `n/4` konsisten.
   - Klik AI dengan LLM mati → misi sesuai urutan kurasi.
   - Print preview menampilkan bullet misi.
4. Skrip throwaway `tmp/verify-mission-suggest.mjs` (mengikuti pola `tmp/driver.mjs`):
   login → ambil 1 report bertopik → `POST /api/reports/:id/suggest-missions` →
   buktikan: (a) semua ID hasil ⊂ kandidat topik (`GET mission-bank?topic_id=`),
   (b) fallback deterministik (2× panggil tanpa AI key → hasil identik + sesuai
   urutan kurasi), (c) heuristik tidak lagi abjad-murni. Boleh dihapus setelah lolos.
   Catatan: respons suggest-missions berbentuk envelope `{ data: { mission_ids: [...] } }`
   (`report_handler.go: SuggestMissions`) — skrip wajib unwrap `data.mission_ids`,
   bukan mengharapkan array mentah.

### File scope (final)

- `frontend/src/features/admin/components/ReportMissionSelector.tsx` — chips + hapus
  list inline/grouping.
- `frontend/src/features/admin/hooks/useReportReview.ts` — pastikan
  `loadTopicMissions(activeTopicId)` dipanggil saat modal dibuka / topik ganti (kecil).
- `backend/internal/usecase/reports/mission_recommender.go` — builder konteks bersama
  + heuristik + kandidat berlabel topik.
- `backend/internal/usecase/reports/reports.go` (`NewUsecase`) +
  `backend/cmd/server/main.go:84` — wiring DI repo Kegiatan
  (`ProgramSubstageRepository` + `SessionSubstageRepository`) ke reports usecase.
- `backend/internal/usecase/reports/prompts/report-missions-system.md`,
  `prompts/report-missions-user.md` — format baru.
- `tmp/verify-mission-suggest.mjs` — skrip verifikasi baru (throwaway).
- Tanpa migrasi DB, tanpa ubah kontrak API, tanpa file produksi baru kecuali helper
  builder bila diperlukan.

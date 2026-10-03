package auth_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
)

// ---------------------------------------------------------------------------
// Gallery snapshot tests (Perbaikan-4): LinkParticipant must copy the
// participant's same-topic photos — each with its OWN file under UploadDir —
// from the source session to the target session of a same-program migration.
// Hand-rolled fakes only, no DB; the link-migration fixture from
// participant_session_gate_test.go provides the session/assessment/attendance
// fakes and the badge reconcile hook.
// ---------------------------------------------------------------------------

// fakeSnapshotPhotoRepo is an in-memory PhotoRepository: ListPhotos filters by
// participant+session (recording every filter for tenant/scope assertions) and
// CreatePhoto appends rows. Unused interface methods panic through the
// embedded nil interface, like the other link fakes.
type fakeSnapshotPhotoRepo struct {
	repository.PhotoRepository
	rows      []entity.SmartPhoto
	listCalls []repository.PhotoFilter
	created   []*entity.SmartPhoto
}

func (r *fakeSnapshotPhotoRepo) ListPhotos(_ context.Context, f repository.PhotoFilter, _, _ int) (*repository.Paginated[entity.SmartPhoto], error) {
	r.listCalls = append(r.listCalls, f)
	var items []entity.SmartPhoto
	for i := range r.rows {
		p := r.rows[i]
		if p.ParticipantID == f.ParticipantID && p.SessionID == f.SessionID {
			items = append(items, p)
		}
	}
	return &repository.Paginated[entity.SmartPhoto]{Items: items, Total: len(items)}, nil
}

func (r *fakeSnapshotPhotoRepo) CreatePhoto(_ context.Context, p *entity.SmartPhoto) error {
	cp := *p
	r.rows = append(r.rows, cp)
	r.created = append(r.created, &cp)
	return nil
}

// photosIn returns the fake's rows belonging to one session (assertion helper).
func photosIn(r *fakeSnapshotPhotoRepo, sessionID string) []entity.SmartPhoto {
	var out []entity.SmartPhoto
	for i := range r.rows {
		if r.rows[i].SessionID == sessionID {
			out = append(out, r.rows[i])
		}
	}
	return out
}

// seedSnapshotStages plants the topic bridge for the snapshot tests:
// Topik A (stage-1) exists in BOTH sessions (source ss-src → target ss-tgt,
// via the shared program_stage), Topik B (stage-2) exists only in the source
// (the target dropped it), Topik C (stage-3) exists only in the target.
// ss-src also carries the fixture's attendance row, so the shared
// sessionStageMaps helper serves both carry steps.
func seedSnapshotStages(f *linkMigrationFixture) {
	f.repo.stages = map[string][]entity.SessionStage{
		"sess-src": {
			{BaseModel: entity.BaseModel{ID: "ss-src"}, SessionID: "sess-src", ProgramStageID: "stage-1"},
			{BaseModel: entity.BaseModel{ID: "ss-src-B"}, SessionID: "sess-src", ProgramStageID: "stage-2"},
		},
		"sess-1": {
			{BaseModel: entity.BaseModel{ID: "ss-tgt"}, SessionID: "sess-1", ProgramStageID: "stage-1"},
			{BaseModel: entity.BaseModel{ID: "ss-tgt-C"}, SessionID: "sess-1", ProgramStageID: "stage-3"},
		},
	}
}

// snapshotPhoto builds a source-session photo row for pid-1 in sess-src.
func snapshotPhoto(id, stageID, original, framed string) entity.SmartPhoto {
	return entity.SmartPhoto{
		BaseModel:       entity.BaseModel{ID: id},
		ParticipantID:   "pid-1",
		SessionID:       "sess-src",
		SessionStageID:  stageID,
		OriginalFileURL: original,
		FramedFileURL:   framed,
		TakenBy:         "fas-1",
		TakenAt:         time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC),
	}
}

// writeSnapshotFile plants a file under UploadDir at a slash-relative path.
func writeSnapshotFile(t *testing.T, dir, rel, content string) {
	t.Helper()
	p := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", p, err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", p, err)
	}
}

// mustReadSnapshotFile reads a file under UploadDir at a slash-relative path.
func mustReadSnapshotFile(t *testing.T, dir, rel string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(rel)))
	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}
	return string(b)
}

// TestLinkParticipantSnapshotCopiesSameTopicPhotosOnly: a same-program link
// copies ONLY the photos whose topic exists in the target session — the copy
// carries the TARGET session's session_stage_id, its own deterministic file
// path (photos/snap-<sourceRowID><ext>, never the source path), and its own
// file bytes on disk. Topik B (source-only) and Topik C (target-only)
// contribute nothing.
func TestLinkParticipantSnapshotCopiesSameTopicPhotosOnly(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A")
	seedSnapshotStages(f)
	dir := t.TempDir()

	srcA := snapshotPhoto("photo-a", "ss-src", "photos/src-a.jpg", "photos/src-a-framed.png")
	srcA.IsReportPhoto = true
	frameID := "frame-1"
	srcA.FrameID = &frameID
	fileSize := int64(1234)
	srcA.FileSize = &fileSize
	srcB := snapshotPhoto("photo-b", "ss-src-B", "photos/src-b.jpg", "")

	photos := &fakeSnapshotPhotoRepo{rows: []entity.SmartPhoto{srcA, srcB}}
	writeSnapshotFile(t, dir, srcA.OriginalFileURL, "BYTES-a")
	writeSnapshotFile(t, dir, srcA.FramedFileURL, "FRAMED-a")
	writeSnapshotFile(t, dir, srcB.OriginalFileURL, "BYTES-b")
	f.uc.SetPhotoSnapshot(photos, dir)

	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("same-program link must succeed, got: %v", err)
	}
	if f.repo.updated == nil || f.repo.updated.SessionID == nil || *f.repo.updated.SessionID != "sess-1" {
		t.Fatalf("participant must be moved to sess-1, got %+v", f.repo.updated)
	}

	// Both reads are tenant-scoped and hit the right sessions.
	if len(photos.listCalls) != 2 {
		t.Fatalf("expected source + target photo lists, got %d", len(photos.listCalls))
	}
	if photos.listCalls[0].SessionID != "sess-src" || photos.listCalls[0].TenantID != "tenant-1" {
		t.Fatalf("source list = %+v, want sess-src scoped to tenant-1", photos.listCalls[0])
	}
	if photos.listCalls[1].SessionID != "sess-1" || photos.listCalls[1].TenantID != "tenant-1" {
		t.Fatalf("target list = %+v, want sess-1 scoped to tenant-1", photos.listCalls[1])
	}

	// Exactly one copy: Topik A's photo under the TARGET stage; nothing for
	// the source-only Topik B and nothing for the target-only Topik C.
	created := photos.created
	if len(created) != 1 {
		t.Fatalf("expected exactly 1 copied photo (Topik A only), got %d", len(created))
	}
	cp := created[0]
	if cp.ID == "photo-a" {
		t.Fatal("copy must get a fresh row ID, not reuse the source ID")
	}
	if cp.SessionID != "sess-1" || cp.ParticipantID != "pid-1" {
		t.Fatalf("copy scope = participant %s session %s, want pid-1/sess-1", cp.ParticipantID, cp.SessionID)
	}
	if cp.SessionStageID != "ss-tgt" {
		t.Fatalf("copy session_stage_id = %q, want ss-tgt (the TARGET session's stage)", cp.SessionStageID)
	}
	// Deterministic target path derived from the SOURCE row ID — different
	// from the source path, so each session's files unlink independently.
	if cp.OriginalFileURL != "photos/snap-photo-a.jpg" {
		t.Fatalf("copy original path = %q, want photos/snap-photo-a.jpg", cp.OriginalFileURL)
	}
	if cp.FramedFileURL != "photos/snap-photo-a-framed.png" {
		t.Fatalf("copy framed path = %q, want photos/snap-photo-a-framed.png", cp.FramedFileURL)
	}
	// Metadata carried as-is.
	if !cp.IsReportPhoto || cp.TakenBy != "fas-1" || !cp.TakenAt.Equal(srcA.TakenAt) {
		t.Fatalf("copy metadata lost: %+v", cp)
	}
	if cp.FrameID == nil || *cp.FrameID != "frame-1" {
		t.Fatalf("copy frame_id = %v, want frame-1", cp.FrameID)
	}
	if cp.FileSize == nil || *cp.FileSize != 1234 {
		t.Fatalf("copy file_size = %v, want 1234", cp.FileSize)
	}
	// Physical independence: copy path ≠ source path AND both files exist
	// under UploadDir with identical bytes.
	if cp.OriginalFileURL == srcA.OriginalFileURL {
		t.Fatal("copy must not share the source's original file path")
	}
	if got := mustReadSnapshotFile(t, dir, srcA.OriginalFileURL); got != "BYTES-a" {
		t.Fatalf("source original bytes = %q, want BYTES-a", got)
	}
	if got := mustReadSnapshotFile(t, dir, cp.OriginalFileURL); got != "BYTES-a" {
		t.Fatalf("copied original bytes = %q, want BYTES-a", got)
	}
	if cp.FramedFileURL == srcA.FramedFileURL {
		t.Fatal("copy must not share the source's framed file path")
	}
	if got := mustReadSnapshotFile(t, dir, cp.FramedFileURL); got != "FRAMED-a" {
		t.Fatalf("copied framed bytes = %q, want FRAMED-a", got)
	}
	// No photo landed under Topik B's or Topik C's stages (or the legacy '').
	for _, p := range photosIn(photos, "sess-1") {
		if p.SessionStageID != "ss-tgt" {
			t.Fatalf("unexpected copied photo stage %q in target session: %+v", p.SessionStageID, p)
		}
	}
}

// TestLinkParticipantSnapshotSkipsLegacyPhotos: photos carrying the 000009
// legacy "" sentinel have no topic to match — they are never copied, while
// the link itself still succeeds and moves the participant.
func TestLinkParticipantSnapshotSkipsLegacyPhotos(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A")
	seedSnapshotStages(f)
	dir := t.TempDir()

	legacy := snapshotPhoto("photo-legacy", "", "photos/legacy.jpg", "")
	photos := &fakeSnapshotPhotoRepo{rows: []entity.SmartPhoto{legacy}}
	writeSnapshotFile(t, dir, legacy.OriginalFileURL, "LEGACY")
	f.uc.SetPhotoSnapshot(photos, dir)

	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("link with legacy photos must succeed, got: %v", err)
	}
	if f.repo.updated == nil {
		t.Fatal("participant must still be moved")
	}
	if len(photos.created) != 0 {
		t.Fatalf("legacy ''-stage photos must not be copied, got %d copies", len(photos.created))
	}
	if got := mustReadSnapshotFile(t, dir, legacy.OriginalFileURL); got != "LEGACY" {
		t.Fatalf("source legacy file must stay untouched, got %q", got)
	}
}

// TestLinkParticipantSnapshotRetryDoesNotDuplicateRows: running the full link
// (and therefore the snapshot step) a second time — the retry after a
// partially applied migration — must not duplicate any photo row: the
// natural-key check on the deterministic target path skips what the first run
// already copied.
func TestLinkParticipantSnapshotRetryDoesNotDuplicateRows(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A")
	seedSnapshotStages(f)
	dir := t.TempDir()

	srcA := snapshotPhoto("photo-a", "ss-src", "photos/src-a.jpg", "")
	photos := &fakeSnapshotPhotoRepo{rows: []entity.SmartPhoto{srcA}}
	writeSnapshotFile(t, dir, srcA.OriginalFileURL, "BYTES-a")
	f.uc.SetPhotoSnapshot(photos, dir)

	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("first link must succeed, got: %v", err)
	}
	if len(photos.created) != 1 {
		t.Fatalf("first link must copy 1 photo, got %d", len(photos.created))
	}

	// Retry: the fake participant still reports the source session (the move
	// write is what a lost/partial run would have dropped), so the whole
	// migration path — including the snapshot — runs again.
	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("retry link must succeed, got: %v", err)
	}
	if len(photos.created) != 1 {
		t.Fatalf("retry must not copy a second row, got %d copies", len(photos.created))
	}
	if rows := photosIn(photos, "sess-1"); len(rows) != 1 {
		t.Fatalf("target session must hold exactly 1 photo row, got %d", len(rows))
	}
	if got := mustReadSnapshotFile(t, dir, "photos/snap-photo-a.jpg"); got != "BYTES-a" {
		t.Fatalf("copied file after retry = %q, want BYTES-a", got)
	}
}

// TestLinkParticipantSnapshotMissingSourceFileSkipsRowButLinkSucceeds: a
// source photo whose file is gone from disk is a data condition — that row is
// skipped, the remaining photos still copy, and the link completes with the
// participant moved.
func TestLinkParticipantSnapshotMissingSourceFileSkipsRowButLinkSucceeds(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A")
	seedSnapshotStages(f)
	dir := t.TempDir()

	gone := snapshotPhoto("photo-gone", "ss-src", "photos/gone.jpg", "")
	ok := snapshotPhoto("photo-ok", "ss-src", "photos/ok.jpg", "")
	photos := &fakeSnapshotPhotoRepo{rows: []entity.SmartPhoto{gone, ok}}
	writeSnapshotFile(t, dir, ok.OriginalFileURL, "BYTES-ok") // gone.jpg never written
	f.uc.SetPhotoSnapshot(photos, dir)

	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err != nil {
		t.Fatalf("missing source file must not abort the link, got: %v", err)
	}
	if f.repo.updated == nil || f.repo.updated.SessionID == nil || *f.repo.updated.SessionID != "sess-1" {
		t.Fatalf("participant must be moved despite the missing file, got %+v", f.repo.updated)
	}
	if len(photos.created) != 1 {
		t.Fatalf("expected only the intact photo copied, got %d copies", len(photos.created))
	}
	if photos.created[0].OriginalFileURL != "photos/snap-photo-ok.jpg" {
		t.Fatalf("copied photo = %q, want photos/snap-photo-ok.jpg", photos.created[0].OriginalFileURL)
	}
}

// TestLinkParticipantSnapshotCopyIOErrorAbortsBeforeMove: a file-copy I/O
// error (here: the deterministic target path is blocked by a directory)
// propagates and aborts the link — attendance was already carried (the step
// before the snapshot) but the participant never moves, preserving the
// ordering-based convergence contract.
func TestLinkParticipantSnapshotCopyIOErrorAbortsBeforeMove(t *testing.T) {
	f := newLinkMigrationFixture("prog-A", "prog-A")
	seedSnapshotStages(f)
	dir := t.TempDir()

	srcA := snapshotPhoto("photo-a", "ss-src", "photos/src-a.jpg", "")
	photos := &fakeSnapshotPhotoRepo{rows: []entity.SmartPhoto{srcA}}
	writeSnapshotFile(t, dir, srcA.OriginalFileURL, "BYTES-a")
	// Block the destination: a directory squatting on the target path makes
	// the file create fail on every platform (EISDIR / ERROR_ACCESS_DENIED).
	if err := os.MkdirAll(filepath.Join(dir, filepath.FromSlash("photos/snap-photo-a.jpg")), 0o755); err != nil {
		t.Fatalf("plant blocking dir: %v", err)
	}
	f.uc.SetPhotoSnapshot(photos, dir)

	if _, err := f.uc.LinkParticipant(context.Background(), "sess-1", "pid-1", "", "tenant-1"); err == nil {
		t.Fatal("copy I/O error must propagate out of LinkParticipant")
	}
	if f.repo.updated != nil {
		t.Fatal("participant must stay in the source session when the photo copy fails")
	}
	if len(f.att.upserts) != 1 {
		t.Fatalf("attendance carry must run BEFORE the photo snapshot, got %d upserts", len(f.att.upserts))
	}
	if len(photos.created) != 0 {
		t.Fatalf("no photo row may be created when the file copy fails, got %d", len(photos.created))
	}
}

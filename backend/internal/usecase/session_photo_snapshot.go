package usecase

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/pkg/util"
)

// photoSnapshotListLimit caps one ListPhotos page during the gallery snapshot,
// mirroring cloneScoredAssessments' 1000-row source read: a participant with
// more photos than this in a single session is beyond the same precedent the
// assessment clone already sets.
const photoSnapshotListLimit = 1000

// copySessionPhotos snapshots the participant's gallery photos from the source
// session to the target session during LinkParticipant. The same-program gate
// upstream guarantees both sessions instantiate the same program, so topic
// identity bridges through program_stage_id exactly like the attendance carry:
//
//   - a source photo's session_stage_id is remapped source stage → program
//     stage → target stage (sessionStageMaps, the shared helper); the copy is
//     inserted with the TARGET session's session_stage_id;
//   - a Topik present only in the target receives no photos (fresh, empty
//     gallery for that topic);
//   - a Topik present only in the source (dropped in the target) contributes
//     no photos — unlike attendance (audit data, explicit error), gallery
//     photos are presentation data: an unmappable photo is logged and skipped,
//     never aborting the link;
//   - legacy "" rows (migration 000009 sentinel, "no topic known") are never
//     copied: they carry no topic to match, so any target topic would be a
//     fabrication — same reason attendance never invents a topic for them.
//
// Physical independence: every copy gets its OWN file copy under UploadDir at
// a deterministic path derived from the SOURCE row ID —
// photos/snap-<sourceRowID><ext> for the original and
// photos/snap-<sourceRowID>-framed<ext> for the framed variant — so deleting a
// photo in one session can never unlink the other session's file (the delete
// handler unlinks original_file_url + framed_file_url of ITS row only).
// FrameID, TakenBy, TakenAt, FileSize and IsReportPhoto are copied as-is;
// report_photo_picks are NOT copied — the new session's picks are fresh user
// choices, and per-topic report photo resolution falls back through its
// topic-scoped tiers (pick → is_report_photo → newest photo) on its own.
//
// Failure semantics (convergence by ordering + idempotency, same as
// cloneScoredAssessments/carryAttendance — the repos share no transaction):
//   - a source file missing on disk, a path resolving outside UploadDir, or a
//     missing source photo row value is a DATA condition: that row is skipped
//     with a log line and the link continues — a broken file must never block
//     the migration;
//   - a file-copy I/O error is returned and ABORTS the link before the
//     participant moves (same semantics as an attendance carry failure);
//   - a retry converges: before any file is copied, the deterministic target
//     path is checked against the target session's existing rows — a row
//     already holding it (natural-key, mirroring the clone's conflict-skip)
//     means that source photo was copied by a previous attempt and is skipped.
func (u *SessionUsecase) copySessionPhotos(ctx context.Context, participantID, oldSessionID, newSessionID, tenantID string) error {
	if u.photoRepo == nil || u.uploadDir == "" || oldSessionID == "" {
		return nil
	}
	srcRes, err := u.photoRepo.ListPhotos(ctx, repository.PhotoFilter{
		ParticipantID: participantID,
		SessionID:     oldSessionID,
		TenantID:      tenantID,
	}, 1, photoSnapshotListLimit)
	if err != nil {
		return err
	}
	if len(srcRes.Items) == 0 {
		return nil
	}
	programOfOld, targetByProgram, err := u.sessionStageMaps(ctx, oldSessionID, newSessionID)
	if err != nil {
		return err
	}
	dstRes, err := u.photoRepo.ListPhotos(ctx, repository.PhotoFilter{
		ParticipantID: participantID,
		SessionID:     newSessionID,
		TenantID:      tenantID,
	}, 1, photoSnapshotListLimit)
	if err != nil {
		return err
	}
	// Natural key: the deterministic target path of every already-copied row.
	copied := make(map[string]bool, len(dstRes.Items))
	for i := range dstRes.Items {
		copied[dstRes.Items[i].OriginalFileURL] = true
	}

	for i := range srcRes.Items {
		src := srcRes.Items[i]
		dstOriginalRel := snapshotPhotoRel(src.ID, filepath.Ext(src.OriginalFileURL), false)
		if copied[dstOriginalRel] {
			// Retry convergence: this source row was already copied by a
			// previous (possibly partially failed) run.
			log.Printf("link_participant: skip photo %s: already copied to session %s", src.ID, newSessionID)
			continue
		}
		if src.OriginalFileURL == "" {
			log.Printf("link_participant: skip photo %s: empty original_file_url (data condition)", src.ID)
			continue
		}
		if src.SessionStageID == "" {
			// Legacy '' = "no topic known" (000009 sentinel): no topic to
			// match against the target's stages, so the photo is not copied
			// (inventing a topic would fabricate data).
			log.Printf("link_participant: skip legacy (no-topic) photo %s participant=%s", src.ID, participantID)
			continue
		}
		programStageID, ok := programOfOld[src.SessionStageID]
		if !ok {
			log.Printf("link_participant: skip photo %s: source stage %s not found in session %s", src.ID, src.SessionStageID, oldSessionID)
			continue
		}
		dstStageID, ok := targetByProgram[programStageID]
		if !ok {
			// Topik present only in the source (dropped in the target): its
			// photos are not copied — the target gallery mirrors its topics.
			log.Printf("link_participant: skip photo %s: program stage %s has no session stage in target session %s", src.ID, programStageID, newSessionID)
			continue
		}

		srcOriginal := filepath.Join(u.uploadDir, filepath.FromSlash(src.OriginalFileURL))
		if !withinUploadDir(u.uploadDir, srcOriginal) {
			log.Printf("link_participant: skip photo %s: original path %q escapes upload dir", src.ID, src.OriginalFileURL)
			continue
		}
		srcFramed := ""
		if src.FramedFileURL != "" {
			srcFramed = filepath.Join(u.uploadDir, filepath.FromSlash(src.FramedFileURL))
			if !withinUploadDir(u.uploadDir, srcFramed) {
				log.Printf("link_participant: skip photo %s: framed path %q escapes upload dir", src.ID, src.FramedFileURL)
				continue
			}
		}
		// Missing source file = data condition: skip the row, keep the link
		// alive. Any OTHER stat failure is an I/O error and propagates.
		missing, serr := sourceFileMissing(srcOriginal)
		if serr != nil {
			return fmt.Errorf("link_participant: stat photo %s original %q: %w", src.ID, src.OriginalFileURL, serr)
		}
		if missing {
			log.Printf("link_participant: skip photo %s: source file %q missing on disk", src.ID, src.OriginalFileURL)
			continue
		}
		if srcFramed != "" {
			missing, serr = sourceFileMissing(srcFramed)
			if serr != nil {
				return fmt.Errorf("link_participant: stat photo %s framed %q: %w", src.ID, src.FramedFileURL, serr)
			}
			if missing {
				log.Printf("link_participant: skip photo %s: framed file %q missing on disk", src.ID, src.FramedFileURL)
				continue
			}
		}

		dstOriginal := filepath.Join(u.uploadDir, filepath.FromSlash(dstOriginalRel))
		if !withinUploadDir(u.uploadDir, dstOriginal) {
			// Unreachable: the name is uuid-derived with a separator-free
			// extension. Refuse to write rather than escape UploadDir.
			return fmt.Errorf("link_participant: snapshot path %q escapes upload dir", dstOriginalRel)
		}
		if err := copyFile(srcOriginal, dstOriginal); err != nil {
			return fmt.Errorf("link_participant: copy photo %s original %q → %q: %w", src.ID, src.OriginalFileURL, dstOriginalRel, err)
		}
		dstFramedRel := ""
		if srcFramed != "" {
			dstFramedRel = snapshotPhotoRel(src.ID, filepath.Ext(src.FramedFileURL), true)
			dstFramed := filepath.Join(u.uploadDir, filepath.FromSlash(dstFramedRel))
			if !withinUploadDir(u.uploadDir, dstFramed) {
				return fmt.Errorf("link_participant: snapshot framed path %q escapes upload dir", dstFramedRel)
			}
			if err := copyFile(srcFramed, dstFramed); err != nil {
				// The original copy above has no row yet — roll it back so a
				// failed attempt leaves no orphan file behind.
				_ = os.Remove(dstOriginal)
				return fmt.Errorf("link_participant: copy photo %s framed %q → %q: %w", src.ID, src.FramedFileURL, dstFramedRel, err)
			}
		}

		clone := &entity.SmartPhoto{
			BaseModel:       entity.BaseModel{ID: util.NewUUID()},
			ParticipantID:   participantID,
			SessionID:       newSessionID,
			SessionStageID:  dstStageID,
			OriginalFileURL: dstOriginalRel,
			FramedFileURL:   dstFramedRel,
			IsReportPhoto:   src.IsReportPhoto,
			TakenBy:         src.TakenBy,
			TakenAt:         src.TakenAt,
		}
		if src.FrameID != nil {
			v := *src.FrameID
			clone.FrameID = &v
		}
		if src.FileSize != nil {
			v := *src.FileSize
			clone.FileSize = &v
		}
		if cerr := u.photoRepo.CreatePhoto(ctx, clone); cerr != nil {
			if isConflict(cerr) {
				// Defensive only (smart_photos has no unique key today): a row
				// already exists — keep its files, skip like the assessment
				// clone's conflict-skip for idempotency.
				log.Printf("link_participant: skip existing photo clone participant=%s source=%s", participantID, src.ID)
				continue
			}
			// Roll back the fresh files so a failed insert leaves no orphans
			// (mirrors UploadHandler.UploadPhoto's rollback). No row references
			// them yet — the natural-key check above proved that.
			_ = os.Remove(dstOriginal)
			if dstFramedRel != "" {
				_ = os.Remove(filepath.Join(u.uploadDir, filepath.FromSlash(dstFramedRel)))
			}
			return cerr
		}
		copied[dstOriginalRel] = true
	}
	return nil
}

// snapshotPhotoRel is the deterministic upload-dir-relative path of a copied
// photo file: photos/snap-<sourceRowID><ext> for the original,
// photos/snap-<sourceRowID>-framed<ext> for the framed variant. Derived from
// the SOURCE row ID so a retry addresses the exact same path — re-running
// overwrites with identical bytes instead of accumulating files, and the path
// doubles as the natural key checked before any copy.
func snapshotPhotoRel(sourceRowID, ext string, framed bool) string {
	name := "snap-" + sourceRowID
	if framed {
		name += "-framed"
	}
	return "photos/" + name + ext
}

// sourceFileMissing reports whether path is absent on disk. A missing file is
// a data condition (the caller skips that row); any other stat failure is an
// I/O error the caller propagates so the link aborts before the move.
func sourceFileMissing(path string) (bool, error) {
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return true, nil
		}
		return false, err
	}
	return false, nil
}

// copyFile copies the bytes of src to dst (creating/truncating dst), making
// sure dst's parent directory exists first. When the byte copy itself fails,
// the partially written dst is removed so a retry starts clean; a failed
// os.Create writes nothing, so there is nothing to clean up. Both paths must
// already be bounds-checked against UploadDir by the caller.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o750); err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		_ = os.Remove(dst)
		return err
	}
	return out.Close()
}

// withinUploadDir reports whether p resolves to a location inside dir — the
// usecase-local mirror of the handler package's unexported withinDir (not
// reusable across packages). Every snapshot read and write is bounds-checked
// with it, so nothing outside UploadDir is ever touched.
func withinUploadDir(dir, p string) bool {
	cleanDir := filepath.Clean(dir)
	cleanP := filepath.Clean(p)
	if cleanDir == "." {
		cleanDir = ""
	}
	rel, err := filepath.Rel(cleanDir, cleanP)
	if err != nil {
		return false
	}
	return !strings.Contains(rel, "..") && rel != ".."
}

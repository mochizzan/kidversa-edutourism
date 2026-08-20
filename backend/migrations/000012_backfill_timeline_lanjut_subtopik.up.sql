-- Phase 5 / Finding A backfill: persisted live-timeline message
-- Old literal (persisted by useLiveMonitor.ts:267) -> new canonical label.
-- The em-dash below is U+2014 (—), matching the exact stored string.
-- Idempotent: rows already updated no longer match the WHERE clause.

-- 1) Snapshot affected PKs + original message for reversible rollback.
CREATE TABLE IF NOT EXISTS _bkp_timeline_lanjut_subtopik (
    id       VARCHAR(36) PRIMARY KEY,
    message  TEXT NOT NULL
);

INSERT INTO _bkp_timeline_lanjut_subtopik (id, message)
SELECT id, message
FROM timeline_events
WHERE message = 'Lanjut SubTopik — kegiatan diselesaikan';

-- 2) Forward update (exact-string, idempotent).
UPDATE timeline_events
SET message = 'Kegiatan diselesaikan'
WHERE message = 'Lanjut SubTopik — kegiatan diselesaikan';

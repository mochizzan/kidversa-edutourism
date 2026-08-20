-- Rollback for 000012: restore original message for the snapshotted PKs only.
UPDATE timeline_events te
JOIN _bkp_timeline_lanjut_subtopik b ON te.id = b.id
SET te.message = b.message;

DROP TABLE IF EXISTS _bkp_timeline_lanjut_subtopik;

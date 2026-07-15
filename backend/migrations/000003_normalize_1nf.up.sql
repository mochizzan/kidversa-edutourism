-- 000003_normalize_1nf.up.sql
-- Phase 3 of the database normalization plan: eliminate the three multi-valued
-- JSON columns (1NF) by moving them into junction tables (or dropping the
-- redundant one). The source JSON columns are dropped here; the junction tables
-- are pure (no soft-delete, no audit columns).

-- mission_banks.related_stage_ids (JSON array) -> mission_bank_stages junction
CREATE TABLE IF NOT EXISTS mission_bank_stages (
  mission_bank_id CHAR(36) NOT NULL,
  program_stage_id CHAR(36) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (mission_bank_id, program_stage_id),
  CONSTRAINT fk_mbs_mission_bank FOREIGN KEY (mission_bank_id) REFERENCES mission_banks(id) ON DELETE CASCADE,
  CONSTRAINT fk_mbs_program_stage FOREIGN KEY (program_stage_id) REFERENCES program_stages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrate any existing related_stage_ids arrays (handles up to 10 elements each).
INSERT INTO mission_bank_stages (mission_bank_id, program_stage_id, sort_order)
SELECT mb.id, JSON_UNQUOTE(JSON_EXTRACT(mb.related_stage_ids, CONCAT('$[', idx.n, ']'))), idx.n
FROM mission_banks mb
JOIN (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) idx
WHERE mb.related_stage_ids IS NOT NULL
  AND mb.related_stage_ids != ''
  AND mb.related_stage_ids != 'null'
  AND JSON_EXTRACT(mb.related_stage_ids, CONCAT('$[', idx.n, ']')) IS NOT NULL;

ALTER TABLE mission_banks DROP COLUMN related_stage_ids;

-- recordings.emotion_tags_json (JSON array) -> recording_emotion_tags junction
CREATE TABLE IF NOT EXISTS recording_emotion_tags (
  recording_id CHAR(36) NOT NULL,
  emotion_tag VARCHAR(40) NOT NULL,
  PRIMARY KEY (recording_id, emotion_tag),
  CONSTRAINT fk_ret_recording FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO recording_emotion_tags (recording_id, emotion_tag)
SELECT r.id, JSON_UNQUOTE(JSON_EXTRACT(r.emotion_tags_json, CONCAT('$[', idx.n, ']')))
FROM recordings r
JOIN (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) idx
WHERE r.emotion_tags_json IS NOT NULL
  AND r.emotion_tags_json != ''
  AND r.emotion_tags_json != 'null'
  AND JSON_EXTRACT(r.emotion_tags_json, CONCAT('$[', idx.n, ']')) IS NOT NULL;

ALTER TABLE recordings DROP COLUMN emotion_tags_json;

-- reports.mission_ids_json is fully redundant with participant_missions; drop it.
ALTER TABLE reports DROP COLUMN mission_ids_json;

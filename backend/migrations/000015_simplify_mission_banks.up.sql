-- Idempotent: skip each step if already applied.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'mission_banks' AND column_name = 'category');
SET @sql := IF(@col > 0, 'ALTER TABLE mission_banks DROP COLUMN category, DROP COLUMN description_parent', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'mission_banks' AND index_name = 'idx_mission_banks_category');
SET @sql2 := IF(@idx > 0, 'DROP INDEX idx_mission_banks_category ON mission_banks', 'SELECT 1');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @col2 := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'mission_banks' AND column_name = 'title_child');
SET @sql3 := IF(@col2 > 0, 'ALTER TABLE mission_banks CHANGE COLUMN title_child title VARCHAR(200) NOT NULL, DROP COLUMN title_parent', 'SELECT 1');
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

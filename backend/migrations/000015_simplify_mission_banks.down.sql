-- Idempotent: add columns back only if missing.
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'mission_banks' AND column_name = 'category');
SET @sql := IF(@col = 0,
  'ALTER TABLE mission_banks ADD COLUMN category enum(\'HOME\',\'PARENT\',\'SCHOOL\') NOT NULL DEFAULT \'HOME\' AFTER program_id, ADD COLUMN title_parent varchar(200) NOT NULL DEFAULT \'\' AFTER title, ADD COLUMN description_parent text DEFAULT NULL AFTER title_parent, ADD KEY idx_mission_banks_category (category)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

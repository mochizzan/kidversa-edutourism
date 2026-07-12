CREATE TABLE timeline_events (
  id CHAR(36) NOT NULL, session_id CHAR(36) NOT NULL, group_id CHAR(36) NOT NULL,
  type VARCHAR(40) NOT NULL, message VARCHAR(512) NOT NULL, user_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_timeline_session_created (session_id, created_at),
  KEY idx_timeline_group_created (group_id, created_at),
  KEY idx_timeline_deleted_at (deleted_at),
  CONSTRAINT fk_timeline_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_timeline_group FOREIGN KEY (group_id) REFERENCES session_groups(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refresh_tokens (
  id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME(3) NOT NULL, revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_refresh_user (user_id),
  KEY idx_refresh_deleted_at (deleted_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id CHAR(36) NOT NULL, tenant_id CHAR(36) NOT NULL,
  recipient_user_id CHAR(36) NOT NULL, type VARCHAR(40) NOT NULL,
  ref_id VARCHAR(64) NULL, message VARCHAR(512) NULL, is_read BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_notif_tenant (tenant_id),
  KEY idx_notif_recipient (recipient_user_id, is_read),
  KEY idx_notif_created (created_at),
  KEY idx_notif_deleted_at (deleted_at),
  CONSTRAINT fk_notif_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

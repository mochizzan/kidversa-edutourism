CREATE TABLE IF NOT EXISTS gallery_tokens (
    id              VARCHAR(36) PRIMARY KEY,
    report_id       VARCHAR(36) NOT NULL,
    participant_id  VARCHAR(36) NOT NULL,
    session_id      VARCHAR(36) NOT NULL,
    tenant_id       VARCHAR(36) NOT NULL,
    token           VARCHAR(64) NOT NULL,
    expires_at      DATETIME(3) NOT NULL,
    revoked         TINYINT(1) DEFAULT 0,
    created_at      DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE KEY uq_gallery_token (token),
    INDEX idx_gallery_report (report_id),
    INDEX idx_gallery_participant_session (participant_id, session_id),

    CONSTRAINT fk_gallery_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
    CONSTRAINT fk_gallery_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
    CONSTRAINT fk_gallery_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_gallery_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

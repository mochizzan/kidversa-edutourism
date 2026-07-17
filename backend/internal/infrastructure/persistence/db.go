package persistence

import (
	"context"
	"database/sql"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/config"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// DB wraps *gorm.DB with a helper Ping for readiness checks.
type DB struct {
	*gorm.DB
}

// OpenDB opens a GORM connection to MariaDB and configures the connection pool.
func OpenDB(cfg *config.Config) (*DB, error) {
	db, err := gorm.Open(mysql.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	sqlDB.SetMaxOpenConns(cfg.DBMaxOpen)
	sqlDB.SetMaxIdleConns(cfg.DBMaxIdle)
	sqlDB.SetConnMaxLifetime(cfg.DBLifetime)
	// Close idle connections after 5 minutes — well before MariaDB's
	// wait_timeout (28800s) and before any network intermediary drops them.
	// This prevents the "first request after idle hangs" problem.
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	return &DB{DB: db}, nil
}

// Ping checks the underlying SQL connection is alive.
func (d *DB) Ping() error {
	sqlDB, err := d.DB.DB()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return sqlDB.PingContext(ctx)
}

// Close closes the underlying SQL connection pool.
func (d *DB) Close() error {
	sqlDB, err := d.DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

// HealthPing checks the underlying SQL connection is alive (alias for Ping).
func HealthPing(ctx context.Context, db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	c, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	return sqlDB.PingContext(c)
}

// OpenSQLDB opens a raw *sql.DB (used by golang-migrate and bootstrap).
func OpenSQLDB(dsn string) (*sql.DB, error) {
	return sql.Open("mysql", dsn)
}

// StartKeepalive pings the database at the given interval to keep pooled
// connections alive and warm the InnoDB buffer pool. Returns a stop function.
func StartKeepalive(db *gorm.DB, interval time.Duration) func() {
	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				sqlDB, err := db.DB()
				if err != nil {
					continue
				}
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				_ = sqlDB.PingContext(ctx)
				cancel()
			}
		}
	}()
	return func() { close(done) }
}

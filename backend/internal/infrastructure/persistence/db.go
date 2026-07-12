package persistence

import (
	"context"
	"database/sql"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
	"kidversa-edutourism-backend/internal/config"
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
	sqlDB.SetConnMaxIdleTime(cfg.DBLifetime)
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

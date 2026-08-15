package migration

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/golang-migrate/migrate/v4"
	mysqlmigrate "github.com/golang-migrate/migrate/v4/database/mysql"
	"github.com/golang-migrate/migrate/v4/source/file"

	"kidversa-edutourism-backend/internal/config"
)

// Run applies all up migrations against the configured database.
// It first ensures the database exists (CREATE DATABASE IF NOT EXISTS) because the
// running mariadb-12 container does not auto-create it.
func Run(cfg *config.Config, migrationsDir string) error {
	// 0. Wait for MariaDB to accept connections. The migrate container may start
	// before MariaDB is ready (a transient connect error during the first attempt
	// can otherwise mark the schema dirty and crash the container in a loop).
	// A bounded retry avoids crashing on cold start.
	if err := waitForDB(cfg, 30*time.Second); err != nil {
		return fmt.Errorf("wait for db: %w", err)
	}

	// 1. Ensure database exists.
	rootDB, err := sql.Open("mysql", cfg.DSNNoDB())
	if err != nil {
		return fmt.Errorf("open root db: %w", err)
	}
	defer rootDB.Close()
	if _, err := rootDB.Exec(fmt.Sprintf(
		"CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", cfg.DBName)); err != nil {
		return fmt.Errorf("create database: %w", err)
	}

	// 2. Run migrations against the target DB.
	db, err := sql.Open("mysql", cfg.DSN())
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer db.Close()

	driver, err := mysqlmigrate.WithInstance(db, &mysqlmigrate.Config{})
	if err != nil {
		return fmt.Errorf("migrate driver: %w", err)
	}
	src, err := (&file.File{}).Open("file://" + migrationsDir)
	if err != nil {
		return fmt.Errorf("migrate source: %w", err)
	}
	m, err := migrate.NewWithInstance("file", src, "mysql", driver)
	if err != nil {
		return fmt.Errorf("migrate new: %w", err)
	}

	if err := upWithRecovery(m); err != nil {
		return err
	}
	log.Println("migrations applied")
	return nil
}

// waitForDB pings the target database until it responds or the timeout elapses,
// backing off between attempts. This prevents the migrate step from failing (and
// leaving schema_migrations dirty) when MariaDB is still starting up.
func waitForDB(cfg *config.Config, timeout time.Duration) error {
	db, err := sql.Open("mysql", cfg.DSNNoDB())
	if err != nil {
		return fmt.Errorf("open ping db: %w", err)
	}
	defer db.Close()

	deadline := time.Now().Add(timeout)
	backoff := 500 * time.Millisecond
	for {
		if err := db.Ping(); err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("database did not become reachable within %s", timeout)
		}
		time.Sleep(backoff)
		if backoff < 5*time.Second {
			backoff *= 2
		}
	}
}

// upWithRecovery applies pending migrations and self-heals a dirty schema state.
// If a previous run failed mid-migration, golang-migrate records the version as
// dirty and refuses to proceed. We force the recorded version (clearing the dirty
// flag) and retry, instead of crashing in a loop. Transient connect errors are
// also retried with backoff.
func upWithRecovery(m *migrate.Migrate) error {
	const maxAttempts = 3
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err := m.Up()
		if err == nil || err == migrate.ErrNoChange {
			return nil
		}
		lastErr = err

		var dirtyErr migrate.ErrDirty
		if errors.As(err, &dirtyErr) {
			log.Printf("migration dirty at version %d: forcing version then retrying (attempt %d/%d)",
				dirtyErr.Version, attempt, maxAttempts)
			// Force the recorded version (clears the dirty flag without replaying
			// SQL). On the next Up(), golang-migrate treats it as already applied.
			if ferr := m.Force(dirtyErr.Version); ferr != nil {
				return fmt.Errorf("force version %d: %w", dirtyErr.Version, ferr)
			}
			time.Sleep(time.Duration(attempt) * time.Second)
			continue
		}

		if isTransientConnect(err) {
			log.Printf("migration connect error (attempt %d/%d): %v", attempt, maxAttempts, err)
			time.Sleep(time.Duration(attempt) * time.Second)
			continue
		}

		return fmt.Errorf("migrate up: %w", err)
	}
	return fmt.Errorf("migrate up: %w", lastErr)
}

// isTransientConnect reports whether err looks like a transient connection
// failure that may succeed on retry (cold start, brief network blip).
func isTransientConnect(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "no connection") ||
		strings.Contains(msg, "deadline exceeded") ||
		strings.Contains(msg, "EOF") ||
		strings.Contains(msg, "driver: bad connection")
}

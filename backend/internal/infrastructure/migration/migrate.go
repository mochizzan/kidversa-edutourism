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
	// CREATE DATABASE uses an identifier that cannot be bound as a query
	// parameter, so only allow known, constant DB names (deny-by-default). Each
	// branch concatenates a literal constant, never the config field, into the
	// SQL string — this avoids a SQL-injection sink while remaining strict.
	createSQL, err := dbCreateSQL(cfg.DBName)
	if err != nil {
		return err
	}
	if _, err := rootDB.Exec(createSQL); err != nil {
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

// dbCreateSQL returns a CREATE DATABASE statement for an allowlisted DB name.
// Deny-by-default: any name not explicitly listed is rejected, so the SQL string
// only ever contains literal constants (DDL identifiers cannot be bound as
// query parameters, hence the allowlist instead of interpolation).
func dbCreateSQL(name string) (string, error) {
	switch name {
	case "kidversa", "kidversa_test":
		return "CREATE DATABASE IF NOT EXISTS `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", nil
	default:
		return "", fmt.Errorf("create database: unsupported DB name %q (allowlist: kidversa, kidversa_test)", name)
	}
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

// upWithRecovery applies pending migrations until none remain, recovering from
// failures in the way golang-migrate's state machine allows:
//
//   - Failed DDL body: golang-migrate first surfaces the RAW driver error while
//     the database is already marked dirty at that version; the next Up() then
//     reports ErrDirty{version} and refuses to run until a Force. We REWIND to
//     version-1 so Up() re-runs the failed migration (migrations are idempotent
//     by design — IF NOT EXISTS / guarded dynamic SQL, at most one table
//     rebuild per run — so re-running a partially applied file is safe). After
//     maxAttempts failures on the same version we
//     SKIP it: Force(version) marks it applied without running it, and Up()
//     continues with the NEXT migration — the historical repair pattern
//     (000003 DROP+CREATEs what 000002 broke; 000009 rebuilds what 000007
//     could not). Skips are always logged loudly.
//
//     FORCED VERSION MATTERS (incident 2026-10-03): the previous code forced
//     version+1, which (a) also skipped the FOLLOWING (repair) migration, and
//     (b) when the failed migration was the LAST one, recorded a version that
//     has no file, so every later start died with
//     "no migration found for version N" and the backend could never boot
//     again without manual SQL. Force(version) keeps the recorded version
//     resolvable in the source in every case.
//
//   - Dirty at the FIRST migration: there is no earlier version to rewind to
//     (Force(0) would record a version that has no file — the same trap as
//     version+1), so this is a hard, fail-closed error: reset the database
//     (compose: `down -v`) or force a valid version manually.
//
//   - Transient connection errors: bounded retries with backoff, then a hard
//     error (fail-closed).
//
//   - Any other repeated error (e.g. broken source files): hard error.
//
// A permanently failing LAST migration is skipped and the run completes with a
// WARN: the schema stays partial, but the recorded state remains valid so a
// fixed environment starts cleanly; the operator must reconcile the schema.
func upWithRecovery(m *migrate.Migrate) error {
	const maxAttempts = 3
	dirtyFailures := 0
	transientFailures := 0
	lastErrorWasRaw := false
	for {
		err := m.Up()
		if err == nil {
			return nil
		}
		if err == migrate.ErrNoChange {
			// No pending migrations remain (all applied or all skipped).
			return nil
		}

		var dirtyErr migrate.ErrDirty
		switch {
		case errors.As(err, &dirtyErr):
			// Dirty at dirtyErr.Version: Up() will keep returning this until we
			// force a version, so the recovery happens right here.
			lastErrorWasRaw = false
			dirtyFailures++
			switch {
			case dirtyFailures >= maxAttempts:
				// Out of attempts: skip THIS version (not version+1 — see the
				// doc comment) and let the next Up() continue after it.
				log.Printf("WARN: migration version %d failed and was skipped after %d attempts: %v",
					dirtyErr.Version, dirtyFailures, err)
				if ferr := m.Force(dirtyErr.Version); ferr != nil {
					return fmt.Errorf("migration version %d failed and skipping it failed: %w (force error: %v)",
						dirtyErr.Version, err, ferr)
				}
				log.Printf("INFO: skipped migration version %d; continuing with subsequent migrations", dirtyErr.Version)
				dirtyFailures = 0

			case dirtyErr.Version <= 1:
				return fmt.Errorf("migration version %d failed and cannot be retried (no earlier version to "+
					"rewind to): %w; reset the database (compose `down -v`) or force a valid version manually",
					dirtyErr.Version, err)

			default:
				// Genuine retry: rewind so the next Up() re-runs the failed
				// migration from a clean version marker.
				log.Printf("WARN: migration version %d failed (attempt %d/%d); rewinding to retry: %v",
					dirtyErr.Version, dirtyFailures, maxAttempts, err)
				if ferr := m.Force(dirtyErr.Version - 1); ferr != nil {
					return fmt.Errorf("migration version %d failed and rewind failed: %w (force error: %v)",
						dirtyErr.Version, err, ferr)
				}
				time.Sleep(time.Duration(dirtyFailures) * time.Second)
			}
			continue

		case isTransientConnect(err):
			lastErrorWasRaw = false
			transientFailures++
			if transientFailures >= maxAttempts {
				return fmt.Errorf("migrate up: transient connection errors exhausted after %d attempts: %w",
					maxAttempts, err)
			}
			time.Sleep(time.Duration(transientFailures) * time.Second)
			continue

		default:
			// Raw non-transient error: this is how a failed DDL body first
			// surfaces (the database is already dirty at that migration), so the
			// next Up() reports ErrDirty and the branch above takes over. If the
			// same raw error instead repeats back-to-back, nothing is dirty and
			// retrying cannot help (e.g. a broken source file) — fail closed.
			if lastErrorWasRaw {
				return fmt.Errorf("migrate up: %w", err)
			}
			lastErrorWasRaw = true
			time.Sleep(time.Second)
		}
	}
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

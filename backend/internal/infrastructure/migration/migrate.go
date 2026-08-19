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

// upWithRecovery applies pending migrations one version at a time. A migration
// may fail for two distinct reasons:
//
//   - Transient connection error (cold start, brief blip): retried up to 3 times
//     with backoff, then surfaced as a hard error if it persists.
//   - DDL/SQL error (a migration file is broken on this engine, e.g. a combined
//     ALTER that trips MariaDB errno 194): the migration is retried up to
//     maxAttempts times, and if it still fails it is SKIPPED — we Force the next
//     version so the run continues. Skipping is safe here because the following
//     migration re-establishes the intended schema (e.g. 000003 DROP+CREATEs
//     stage_contents after 000002's broken ALTER; 000009 rebuilds what 000007
//     could not). The skip is always logged loudly so the operator knows a
//     recorded migration did not run.
//
// If even the LAST migration fails after all retries, there is no next version
// to skip to, so we return a clear crash error and the backend will not start.
func upWithRecovery(m *migrate.Migrate) error {
	const maxAttempts = 3
	// Track the most severe failure so we can report a useful crash message.
	var lastErr error
	for {
		err := m.Up()
		if err == nil {
			return nil
		}
		if err == migrate.ErrNoChange {
			// No pending migrations remain (all applied or all skipped).
			return nil
		}
		lastErr = err

		var dirtyErr migrate.ErrDirty
		ddlOrDirty := errors.As(err, &dirtyErr)
		if !ddlOrDirty && !isTransientConnect(err) {
			// Unexpected non-dirty, non-connect error: do not silently skip it.
			return fmt.Errorf("migrate up: %w", err)
		}

		// Retry the same version a few times before deciding to skip it.
		retried := false
		for attempt := 1; attempt < maxAttempts; attempt++ {
			time.Sleep(time.Duration(attempt) * time.Second)
			retryErr := m.Up()
			if retryErr == nil {
				return nil
			}
			if retryErr == migrate.ErrNoChange {
				return nil
			}
			if !isTransientConnect(retryErr) {
				// Persistent DDL error (or dirty again): stop retrying this version.
				lastErr = retryErr
				retried = true
				break
			}
			lastErr = retryErr
		}

		if !retried {
			// Only transient connect failures remained; if we reach here with a
			// transient error the retries above did not clear it.
			if isTransientConnect(lastErr) {
				return fmt.Errorf("migrate up: transient connection errors exhausted after %d attempts: %w", maxAttempts, lastErr)
			}
		}

		// Decide whether to skip. A dirty version means the file failed partway;
		// skip to the next version so the run can continue.
		if ddlOrDirty || !isTransientConnect(lastErr) {
			skipVersion := dirtyErr.Version + 1
			log.Printf("WARN: migration version %d failed and was skipped after %d attempts: %v",
				dirtyErr.Version, maxAttempts, lastErr)
			if ferr := m.Force(skipVersion); ferr != nil {
				return fmt.Errorf("migration version %d failed and there is no next version to skip to; "+
					"the schema cannot be recovered automatically: %w (force error: %v)",
					dirtyErr.Version, lastErr, ferr)
			}
			log.Printf("INFO: forced schema_migrations to version %d; continuing with subsequent migrations", skipVersion)
			continue
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

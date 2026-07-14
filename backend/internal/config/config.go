package config

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all runtime configuration sourced from environment variables.
// No secrets are hardcoded; values come from .env (dev) or the environment (prod/compose).
type Config struct {
	// Database
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBMaxOpen  int
	DBMaxIdle  int
	DBLifetime time.Duration

	// JWT / auth
	JWTSecret      string
	JWTAccessTTL   time.Duration
	JWTRefreshTTL  time.Duration
	BcryptCost     int
	ReportTokenTTL time.Duration
	ConsentTokenTTL time.Duration
	CookieSecure   bool
	CookieSameSite string

	// HTTP / server
	ServerPort  string
	CORSOrigins []string
	UploadDir   string
	UploadMaxMB int

	// SSE / cookie
	CookieName string

	// Rate limiting
	RateLimitPerMin int

	// SSE
	SSEKeepaliveSec int

	// Backends (single-instance in v1; memory is the only supported backend)
	RealtimeBackend string
	RevokerBackend  string

	// Bootstrap
	BootstrapSuperadminPassword string

	// Test database (separate from dev/prod)
	TestDBHost     string
	TestDBPort     string
	TestDBUser     string
	TestDBPassword string
	TestDBName     string
}

// Load reads configuration from the environment (optionally via .env) and validates the critical fields.
func Load() *Config {
	if err := findAndLoadDotEnv(); err != nil {
		log.Printf("config: .env load skipped: %v", err)
	}

	c := &Config{
		DBHost:     getEnv("DB_HOST", "127.0.0.1"),
		DBPort:     getEnv("DB_PORT", "3306"),
		DBUser:     getEnv("DB_USER", "root"),
		DBPassword: getEnv("DB_PASSWORD", ""),
		DBName:     getEnv("DB_NAME", "kidversa"),
		DBMaxOpen:  getEnvInt("DB_MAX_OPEN", 25),
		DBMaxIdle:  getEnvInt("DB_MAX_IDLE", 10),
		DBLifetime: getEnvDuration("DB_CONN_MAX_LIFETIME", time.Hour),

		JWTSecret:      getEnv("JWT_SECRET", ""),
		JWTAccessTTL:   getEnvDuration("JWT_ACCESS_TTL", 15*time.Minute),
		JWTRefreshTTL:  getEnvDuration("JWT_REFRESH_TTL", 168*time.Hour),
		BcryptCost:     getEnvInt("BCRYPT_COST", 12),
		ReportTokenTTL: getEnvDuration("REPORT_TOKEN_TTL_HOURS", 168*time.Hour),
		ConsentTokenTTL: getEnvDuration("CONSENT_TOKEN_TTL_HOURS", 24*time.Hour),
		CookieSecure:   getEnvBool("COOKIE_SECURE", false),
		CookieSameSite: getEnv("COOKIE_SAMESITE", "Lax"),

		ServerPort:  getEnv("SERVER_PORT", "8080"),
		CORSOrigins: parseOrigins(getEnv("CORS_ORIGINS", "http://localhost:5173")),
		UploadDir:   getEnv("UPLOAD_DIR", "./uploads"),

		CookieName: getEnv("COOKIE_NAME", "kidversa_session"),

		RateLimitPerMin: getEnvInt("RATE_LIMIT_PER_MIN", 60),
		SSEKeepaliveSec: getEnvInt("SSE_KEEPALIVE_SEC", 15),
		UploadMaxMB:     getEnvInt("UPLOAD_MAX_MB", 25),

		RealtimeBackend: getEnv("REALTIME_BACKEND", "memory"),
		RevokerBackend:  getEnv("REVOKER_BACKEND", "memory"),

		BootstrapSuperadminPassword: getEnv("BOOTSTRAP_SUPERADMIN_PASSWORD", ""),

		TestDBHost:     getEnv("TEST_DB_HOST", "127.0.0.1"),
		TestDBPort:     getEnv("TEST_DB_PORT", "3306"),
		TestDBUser:     getEnv("TEST_DB_USER", "root"),
		TestDBPassword: getEnv("TEST_DB_PASSWORD", ""),
		TestDBName:     getEnv("TEST_DB_NAME", "kidversa_test"),
	}

	// Validate critical security field.
	if len(c.JWTSecret) < 32 {
		log.Fatalf("config: JWT_SECRET must be at least 32 bytes (got %d); refusing to start", len(c.JWTSecret))
	}
	if c.BcryptCost < 10 || c.BcryptCost > 14 {
		c.BcryptCost = 12
	}
	return c
}

// DSN returns the MySQL/MariaDB data source name (without a specific database) for CREATE DATABASE steps.
func (c *Config) DSNNoDB() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/?parseTime=true&loc=Local&multiStatements=true",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort)
}

// DSN returns the MySQL/MariaDB data source name bound to the configured database.
func (c *Config) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local&multiStatements=true",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName)
}

// SSECookieName returns the configured SSE session cookie name.
func (c *Config) SSECookieName() string {
	if c.CookieName == "" {
		return "kidversa_session"
	}
	return c.CookieName
}

// RefreshCookieName returns the configured refresh-token cookie name.
func (c *Config) RefreshCookieName() string {
	return getEnv("REFRESH_COOKIE_NAME", "kidversa_refresh")
}

// TestDSN returns the DSN for the isolated test database.
func (c *Config) TestDSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local&multiStatements=true",
		c.TestDBUser, c.TestDBPassword, c.TestDBHost, c.TestDBPort, c.TestDBName)
}

// findAndLoadDotEnv locates the Go module root by walking upward for go.mod,
// then loads .env from that directory. Falls back to CWD if no module root is found.
func findAndLoadDotEnv() error {
	dir, err := os.Getwd()
	if err != nil {
		return err
	}
	for {
		envPath := filepath.Join(dir, ".env")
		if _, statErr := os.Stat(envPath); statErr == nil {
			log.Printf("config: loaded .env from %s", envPath)
			return godotenv.Load(envPath)
		}
		// Stop at filesystem root.
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return godotenv.Load() // fallback: try CWD (prod/compose with env injection)
}

func getEnv(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func getEnvBool(key string, def bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}

func getEnvDuration(key string, def time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return def
	}
	return d
}

func parseOrigins(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

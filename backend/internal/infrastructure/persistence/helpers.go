package persistence

import (
	"crypto/rand"
	"encoding/hex"
	"strings"

	"github.com/google/uuid"
)

// newUUID returns a random UUID v4 string (used for CHAR(36) primary keys).
func newUUID() string {
	return uuid.NewString()
}

// NewUUID is the exported alias of newUUID (for cross-package callers).
func NewUUID() string {
	return newUUID()
}

// GenerateConsentToken is the exported alias of generateConsentToken (64-hex
// cryptographically-random consent token).
func GenerateConsentToken() (string, error) {
	return generateConsentToken()
}

// generateConsentToken returns a 64-char hex (32-byte) cryptographically-random token.
func generateConsentToken() (string, error) {
	var buf [32]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

// isDuplicate reports whether err is a MySQL/MariaDB duplicate-entry (unique constraint) error.
func isDuplicate(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate") || strings.Contains(msg, "1062") || strings.Contains(msg, "er_dup_entry")
}

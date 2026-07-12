package auth

import (
	"crypto/sha256"
	"encoding/hex"
)

// sha256Hex returns the hex SHA-256 of s (used to store refresh tokens hashed).
func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

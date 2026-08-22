package util

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/google/uuid"
)

// randomTokenBytes is the entropy width of RandomToken: 32 bytes → 64 hex chars.
const randomTokenBytes = 32

// NewUUID returns a random UUID v4 string. It is the single source of identifier
// generation across layers (CHAR(36) primary keys, batch/correlation ids).
func NewUUID() string {
	return uuid.NewString()
}

// RandomToken returns a 64-char hex (32-byte) cryptographically-random token.
// It backs every unguessable single-purpose link token in the system — parent
// report access tokens and combined consent tokens — which previously had three
// byte-identical generators in three different packages.
func RandomToken() (string, error) {
	var buf [randomTokenBytes]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

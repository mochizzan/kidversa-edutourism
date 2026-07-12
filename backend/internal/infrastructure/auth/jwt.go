package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	appconfig "kidversa-edutourism-backend/internal/config"
)

// Claims is the JWT payload. jti enables denylisting on logout/password-change.
type Claims struct {
	UserID   string `json:"uid"`
	TenantID string `json:"tid"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

const (
	issuer = "kidversa-backend"
	aud    = "kidversa-web"
)

// JWTManager issues and parses signed JWTs (HS256).
type JWTManager struct {
	secret       []byte
	accessTTL    time.Duration
	refreshTTL   time.Duration
}

// NewJWTManager builds a JWTManager from config.
func NewJWTManager(cfg *appconfig.Config) *JWTManager {
	return &JWTManager{
		secret:     []byte(cfg.JWTSecret),
		accessTTL:  cfg.JWTAccessTTL,
		refreshTTL: cfg.JWTRefreshTTL,
	}
}

// Generate issues an access + opaque refresh token pair. tenantID may be nil
// (global SUPER_ADMIN) — it is stored as an empty string in the claim.
func (m *JWTManager) Generate(userID string, tenantID *string, role string) (access, refresh string, err error) {
	tid := ""
	if tenantID != nil {
		tid = *tenantID
	}
	now := time.Now()
	accessClaims := Claims{
		UserID:   userID,
		TenantID: tid,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:   issuer,
			Audience: jwt.ClaimStrings{aud},
			Subject:  userID,
			IssuedAt: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.accessTTL)),
			ID:       uuid.NewString(),
		},
	}
	access, err = jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).SignedString(m.secret)
	if err != nil {
		return "", "", err
	}

	// Opaque refresh token (random, not a JWT) — stored hashed in refresh_tokens.
	rb := make([]byte, 32)
	if _, err = rand.Read(rb); err != nil {
		return "", "", err
	}
	refresh = hex.EncodeToString(rb)
	return access, refresh, nil
}

// Parse validates and returns the claims of an access token. Only HS256 is accepted.
func (m *JWTManager) Parse(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return m.secret, nil
	}, jwt.WithIssuer(issuer), jwt.WithAudience(aud), jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		return nil, err
	}
	return claims, nil
}

// RefreshTTL exposes the configured refresh lifetime.
func (m *JWTManager) RefreshTTL() time.Duration { return m.refreshTTL }

// AccessTTL exposes the configured access lifetime.
func (m *JWTManager) AccessTTL() time.Duration { return m.accessTTL }

// HashRefresh returns the SHA-256 hex of a refresh token for storage.
func HashRefresh(token string) string {
	return sha256Hex(token)
}

// BcryptHash hashes a plaintext password with the given cost.
func BcryptHash(plain string, cost int) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), cost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// BcryptCompare verifies a plaintext password against a hash.
func BcryptCompare(hash, plain string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain))
}

package auth

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/google/uuid"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// TokenRevoker abstracts the jti denylist (in-memory v1, redis later).
type TokenRevoker interface {
	Revoke(ctx context.Context, jti string, ttl time.Duration)
	IsRevoked(ctx context.Context, jti string) bool
}

// RefreshStore persists opaque refresh tokens (hashed).
type RefreshStore interface {
	Create(ctx context.Context, userID, tokenHash string, expiresAt time.Time) error
	Revoke(ctx context.Context, tokenHash string) error
	RevokeAllForUser(ctx context.Context, userID string) error
	GetByHash(ctx context.Context, tokenHash string) (*RefreshRecord, error)
	CleanExpired(ctx context.Context, before time.Time) (int64, error)
	StartCleanup(ctx context.Context, interval, maxAge time.Duration) func()
}

// RefreshRecord is a stored refresh token row.
type RefreshRecord struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
	RevokedAt *time.Time
}

// KioskTokenTTL is the default lifetime of an issued kiosk token. It is also the
// upper bound enforced by IssueKioskToken (ttl is clamped to [1h, KioskTokenTTL]).
const KioskTokenTTL = 4 * time.Hour

// Usecase implements authentication business logic.
type Usecase struct {
	users   repository.UserRepository
	jwt     *JWTManager
	revoker TokenRevoker
	refresh RefreshStore
	kiosk   KioskTokenStore
	cost    int
}

// NewUsecase builds the auth usecase.
func NewUsecase(users repository.UserRepository, jwt *JWTManager, revoker TokenRevoker, refresh RefreshStore, kiosk KioskTokenStore, cost int) *Usecase {
	return &Usecase{users: users, jwt: jwt, revoker: revoker, refresh: refresh, kiosk: kiosk, cost: cost}
}

// Login verifies credentials and issues a token pair.
func (u *Usecase) Login(ctx context.Context, email, password string) (*LoginResult, error) {
	user, err := u.users.GetByEmail(ctx, email)
	if err != nil {
		// Do not reveal whether the account exists.
		return nil, apperrors.Unauthorized("invalid_credentials", err)
	}
	if !user.IsActive || user.ApprovalStatus != entity.ApprovalApproved {
		return nil, apperrors.Unauthorized("invalid_credentials", errors.New("inactive"))
	}
	if err := BcryptCompare(user.PasswordHash, password); err != nil {
		return nil, apperrors.Unauthorized("invalid_credentials", err)
	}
	// Enforce password change: do not issue a token while the user is still
	// required to change their password (e.g. the bootstrapped super-admin on
	// first login). The client redirects to the change-password screen.
	if user.MustChangePassword {
		return nil, apperrors.Forbidden("password_change_required",
			errors.New("password change required"))
	}

	access, refreshTok, err := u.jwt.Generate(user.ID, user.TenantID, string(user.Role))
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	if err := u.refresh.Create(ctx, user.ID, HashRefresh(refreshTok), time.Now().Add(u.jwt.RefreshTTL())); err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return &LoginResult{AccessToken: access, RefreshToken: refreshTok, User: user}, nil
}

// LoginResult bundles tokens + user.
type LoginResult struct {
	AccessToken  string
	RefreshToken string
	User         *entity.User
}

// Refresh rotates the refresh token (1-use) and issues a new pair.
func (u *Usecase) Refresh(ctx context.Context, oldRefresh string) (*LoginResult, error) {
	hash := HashRefresh(oldRefresh)
	rec, err := u.refresh.GetByHash(ctx, hash)
	if err != nil {
		return nil, apperrors.Unauthorized("token_invalid", err)
	}
	// Reuse detection: if the presented token was already revoked, the whole family is compromised.
	if rec.RevokedAt != nil {
		if err := u.refresh.RevokeAllForUser(ctx, rec.UserID); err != nil {
			log.Printf("auth: failed to revoke token family for user %s: %v", rec.UserID, err)
		}
		return nil, apperrors.Unauthorized("token_invalid", errors.New("reuse detected"))
	}
	if time.Now().After(rec.ExpiresAt) {
		return nil, apperrors.Unauthorized("token_invalid", errors.New("refresh expired"))
	}
	// Revoke the old token (rotation) and issue a new pair.
	if err := u.refresh.Revoke(ctx, hash); err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	user, err := u.users.GetByID(ctx, rec.UserID)
	if err != nil {
		return nil, apperrors.Unauthorized("token_invalid", err)
	}
	access, refreshTok, err := u.jwt.Generate(user.ID, user.TenantID, string(user.Role))
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	if err := u.refresh.Create(ctx, user.ID, HashRefresh(refreshTok), time.Now().Add(u.jwt.RefreshTTL())); err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return &LoginResult{AccessToken: access, RefreshToken: refreshTok, User: user}, nil
}

// Logout revokes the current refresh token and denylists the access jti.
func (u *Usecase) Logout(ctx context.Context, refreshTok, accessJTI string, accessTTL time.Duration) error {
	if refreshTok != "" {
		if err := u.refresh.Revoke(ctx, HashRefresh(refreshTok)); err != nil {
			log.Printf("auth: logout revoke token failed: %v", err)
		}
	}
	if accessJTI != "" {
		u.revoker.Revoke(ctx, accessJTI, accessTTL)
	}
	return nil
}

// Logout revokes the current refresh token and denylists the access jti.
// ttl is clamped to [1h, KioskTokenTTL] (plan B11). The raw token is never logged.
func (u *Usecase) IssueKioskToken(ctx context.Context, sessionID, tenantID string, ttl time.Duration) (string, error) {
	const minTTL = time.Hour
	const maxTTL = KioskTokenTTL
	if ttl < minTTL {
		ttl = minTTL
	}
	if ttl > maxTTL {
		ttl = maxTTL
	}
	if u.kiosk == nil {
		return "", apperrors.Internal("internal_error", nil)
	}
	token, err := u.kiosk.Issue(ctx, sessionID, tenantID, ttl)
	if err != nil {
		return "", err
	}
	return token, nil
}

// ValidateKioskToken validates a kiosk token and returns its session/tenant binding.
func (u *Usecase) ValidateKioskToken(ctx context.Context, token string) (sessionID, tenantID string, err error) {
	if u.kiosk == nil {
		return "", "", apperrors.Internal("internal_error", nil)
	}
	return u.kiosk.Validate(ctx, token)
}

// ConsumeKioskToken marks a kiosk token as used (single-use).
func (u *Usecase) ConsumeKioskToken(ctx context.Context, token string) error {
	if u.kiosk == nil {
		return apperrors.Internal("internal_error", nil)
	}
	return u.kiosk.Consume(ctx, token)
}

// Register creates a pending, inactive user (self-service); an admin must approve.
func (u *Usecase) Register(ctx context.Context, name, email, phone string, tenantID *string, role entity.UserRole, password string) (*entity.User, error) {
	hash, err := BcryptHash(password, u.cost)
	if err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	if role == "" {
		role = entity.RoleFasilitator
	}
	// Privilege-escalation guard: SUPER_ADMIN may only be created via the env
	// bootstrap, never through self-registration.
	if role == entity.RoleSuperAdmin {
		return nil, apperrors.BadRequest("invalid_role",
			errors.New("superadmin tidak boleh self-register"))
	}
	user := &entity.User{
		BaseModel:      entity.BaseModel{ID: uuid.NewString()},
		TenantID:       tenantID,
		Email:          email,
		PasswordHash:   hash,
		Name:           name,
		Phone:          phone,
		Role:           role,
		IsActive:       false,
		ApprovalStatus: entity.ApprovalPending,
	}
	if err := u.users.Create(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

// ChangePassword lets an authenticated user change their own password.
// oldPassword must match the current hash; newPassword must be >= 8 chars.
func (u *Usecase) ChangePassword(ctx context.Context, userID, oldPassword, newPassword string) error {
	if len(newPassword) < 8 {
		return apperrors.BadRequest("weak_password", errors.New("password minimal 8 karakter"))
	}
	user, err := u.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if err := BcryptCompare(user.PasswordHash, oldPassword); err != nil {
		return apperrors.Unauthorized("invalid_credentials", err)
	}
	hash, err := BcryptHash(newPassword, u.cost)
	if err != nil {
		return apperrors.Internal("internal_error", err)
	}
	if err := u.users.UpdatePassword(ctx, userID, hash); err != nil {
		return err
	}
	// Clear the forced-change flag now that the user owns their password.
	return u.users.ClearMustChangePassword(ctx, userID)
}

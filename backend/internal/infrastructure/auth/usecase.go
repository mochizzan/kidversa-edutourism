package auth

import (
	"context"
	"errors"
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
}

// RefreshRecord is a stored refresh token row.
type RefreshRecord struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
	RevokedAt *time.Time
}

// Usecase implements authentication business logic.
type Usecase struct {
	users   repository.UserRepository
	jwt     *JWTManager
	revoker TokenRevoker
	refresh RefreshStore
	cost    int
}

// NewUsecase builds the auth usecase.
func NewUsecase(users repository.UserRepository, jwt *JWTManager, revoker TokenRevoker, refresh RefreshStore, cost int) *Usecase {
	return &Usecase{users: users, jwt: jwt, revoker: revoker, refresh: refresh, cost: cost}
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
		_ = u.refresh.RevokeAllForUser(ctx, rec.UserID)
		return nil, apperrors.Unauthorized("token_invalid", errors.New("reuse detected"))
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
		_ = u.refresh.Revoke(ctx, HashRefresh(refreshTok))
	}
	if accessJTI != "" {
		u.revoker.Revoke(ctx, accessJTI, accessTTL)
	}
	return nil
}

// ChangePassword verifies the old password, updates to a new hash, and revokes all sessions.
func (u *Usecase) ChangePassword(ctx context.Context, userID, oldPwd, newPwd string) error {
	user, err := u.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if err := BcryptCompare(user.PasswordHash, oldPwd); err != nil {
		return apperrors.Unauthorized("invalid_credentials", err)
	}
	hash, err := BcryptHash(newPwd, u.cost)
	if err != nil {
		return apperrors.Internal("internal_error", err)
	}
	user.PasswordHash = hash
	user.MustChangePassword = false
	if err := u.users.Update(ctx, user); err != nil {
		return err
	}
	// Revoke ALL refresh tokens + denylist all active jtis (force re-login everywhere).
	_ = u.refresh.RevokeAllForUser(ctx, userID)
	return nil
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

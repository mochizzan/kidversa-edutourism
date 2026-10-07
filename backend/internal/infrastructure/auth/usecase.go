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
	// GetByHashForUpdate is GetByHash plus a SELECT ... FOR UPDATE row lock.
	// Callers MUST run it inside Transaction; otherwise the lock is released
	// immediately and it degrades to an unlocked read.
	GetByHashForUpdate(ctx context.Context, tokenHash string) (*RefreshRecord, error)
	// Transaction runs fn with a store bound to a single DB transaction.
	Transaction(ctx context.Context, fn func(RefreshStore) error) error
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

// RefreshReuseGracePeriod is the D2 theft-vs-race discriminator (AR-6): a
// refresh token reused within this window after its revocation is treated as
// a benign concurrent-rotation race (401 WITHOUT family kill); reuse of a
// longer-dead token is treated as theft (401 WITH family kill). Approved W=10s.
const RefreshReuseGracePeriod = 10 * time.Second

// Usecase implements authentication business logic.
type Usecase struct {
	users   repository.UserRepository
	jwt     *JWTManager
	revoker TokenRevoker
	refresh RefreshStore
	cost    int
	now     func() time.Time
}

// NewUsecase builds the auth usecase.
func NewUsecase(users repository.UserRepository, jwt *JWTManager, revoker TokenRevoker, refresh RefreshStore, cost int) *Usecase {
	return &Usecase{users: users, jwt: jwt, revoker: revoker, refresh: refresh, cost: cost, now: time.Now}
}

// SetClock overrides the clock source (tests only: fake time for the D2
// grace-window boundary checks). Production always uses time.Now.
func (u *Usecase) SetClock(fn func() time.Time) { u.now = fn }

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
//
// The rotation runs fully inside a Transaction with a SELECT ... FOR UPDATE
// locked re-read of the presented token row, so two concurrent same-cookie
// refreshes serialize: the winner rotates, the loser observes the committed
// revoked_at and enters the D2 reuse path below instead of forking a second
// chain (AR-6).
//
// D2 discriminator: a revoked token reused within RefreshReuseGracePeriod of
// its (locked) revoked_at is a benign rotation race → 401 WITHOUT family
// kill (telemetry: refresh_reuse_grace). Reuse of a longer-dead token is
// treated as theft → family kill preserved (telemetry: refresh_reuse_kill).
// Grace is compared in app time against the locked re-read; note the DB
// stores revoked_at at ms precision (datetime(3)) while the app clock has ns
// precision, so the W boundary can shift by <1ms.
//
// Residual: users.GetByID reads outside the tx (UserRepository has no tx
// binding here). A user deleted/deactivated between Revoke and the read fails
// closed (401); a user deactivated between the read and Create leaves one
// live rotated pair — accepted (next refresh re-checks nothing, but access
// expiry ≤AccessTTL bounds it; login-again is required only on expiry).
func (u *Usecase) Refresh(ctx context.Context, oldRefresh string) (*LoginResult, error) {
	hash := HashRefresh(oldRefresh)
	var res *LoginResult
	var reuseErr error
	err := u.refresh.Transaction(ctx, func(tx RefreshStore) error {
		rec, err := tx.GetByHashForUpdate(ctx, hash)
		if err != nil {
			// The store already distinguishes miss (401 token_invalid) from
			// infrastructure failure (500 internal_error) — preserve it instead
			// of collapsing everything to 401.
			if _, _, ok := apperrors.AsAppError(err); ok {
				return err
			}
			return apperrors.Unauthorized("token_invalid", err)
		}
		now := u.now()
		if now.After(rec.ExpiresAt) {
			return apperrors.Unauthorized("token_invalid", errors.New("refresh expired"))
		}
		// Reuse detection: the presented token was already revoked.
		if rec.RevokedAt != nil {
			if now.Sub(*rec.RevokedAt) <= RefreshReuseGracePeriod {
				// Benign race: sibling rotation landed within W. Reject the
				// replay but leave the family intact — the winner's chain
				// (already issued) stays usable. No writes, so the rollback
				// below is a no-op.
				log.Printf("refresh_reuse_grace: user %s reused token within %s", rec.UserID, RefreshReuseGracePeriod)
				return apperrors.Unauthorized("token_invalid", errors.New("reuse within grace"))
			}
			// Genuine reuse: kill the family INSIDE the tx and COMMIT it.
			// The 401 travels out via reuseErr with a nil return — returning
			// the 401 here would roll the kill back and silently preserve
			// the compromised family.
			log.Printf("refresh_reuse_kill: user %s reused long-dead token, revoking family", rec.UserID)
			if err := tx.RevokeAllForUser(ctx, rec.UserID); err != nil {
				log.Printf("auth: failed to revoke token family for user %s: %v", rec.UserID, err)
			}
			reuseErr = apperrors.Unauthorized("token_invalid", errors.New("reuse detected"))
			return nil
		}
		// Revoke the old token (rotation) and issue a new pair. Both the
		// revoke and the successor insert join the SAME tx: a crash after
		// Revoke rolls back, so the predecessor stays valid and a retry
		// succeeds instead of stranding the client with no usable token.
		if err := tx.Revoke(ctx, hash); err != nil {
			return apperrors.Internal("internal_error", err)
		}
		// Residual: outside-tx read (see doc comment above).
		user, err := u.users.GetByID(ctx, rec.UserID)
		if err != nil {
			return apperrors.Unauthorized("token_invalid", err)
		}
		access, refreshTok, err := u.jwt.Generate(user.ID, user.TenantID, string(user.Role))
		if err != nil {
			return apperrors.Internal("internal_error", err)
		}
		if err := tx.Create(ctx, user.ID, HashRefresh(refreshTok), u.now().Add(u.jwt.RefreshTTL())); err != nil {
			return apperrors.Internal("internal_error", err)
		}
		res = &LoginResult{AccessToken: access, RefreshToken: refreshTok, User: user}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if reuseErr != nil {
		return nil, reuseErr
	}
	return res, nil
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
//
// On success ALL sessions are revoked (D1, OWASP standard: re-login
// required): RevokeAllForUser kills every refresh token incl. the current
// one, and revoker.Revoke denylists the current access jti until its expiry.
// Body order: verify old → hash → UpdatePassword → RevokeAllForUser →
// revoker.Revoke(jti) → ClearMustChangePassword.
//
// If a revoke step fails the password IS already changed; the failure maps
// to internal_error (fail closed on the response, the caller can retry the
// change or log out). An empty currentJTI skips only the denylist add — the
// family revoke still runs, and the current access token then dies at its
// natural expiry (≤AccessTTL, default 15m).
//
// KNOWN-ACCEPTED residual: other-device ACCESS tokens stay valid until their
// own expiry (≤AccessTTL) because there is no per-user token epoch without a
// schema change (declined). Document in release notes.
func (u *Usecase) ChangePassword(ctx context.Context, userID, oldPassword, newPassword, currentJTI string, accessTTL time.Duration) error {
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
	// Password IS changed past this point; revocation failures below are
	// reported as internal_error but never roll the password back.
	if err := u.refresh.RevokeAllForUser(ctx, userID); err != nil {
		return apperrors.Internal("internal_error", err)
	}
	if currentJTI != "" {
		u.revoker.Revoke(ctx, currentJTI, accessTTL)
	}
	// Clear the forced-change flag now that the user owns their password.
	return u.users.ClearMustChangePassword(ctx, userID)
}

package auth_test

// AR-6 BE (F-A-007/F-B-002 backend half) regression: atomic rotation with the
// D2 reuse discriminator (RefreshReuseGracePeriod = 10s).

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/config"
	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	"kidversa-edutourism-backend/internal/infrastructure/auth"
	"kidversa-edutourism-backend/internal/infrastructure/persistence"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// txRefreshStore is a hand fake with tx semantics: Transaction runs fn against
// a tx-bound copy; ops inside fn record on the tx copy, merged on success and
// discarded on error (rollback). GetByHashForUpdate on the tx copy takes the
// "row lock" (single-goroutine mutex — serializes fake concurrency).
type txRefreshStore struct {
	mu         sync.Mutex
	rows       map[string]*auth.RefreshRecord // hash -> row
	revAll     map[string]int                 // userID -> family-kill count
	failCreate bool                           // crash injection: Create fails inside tx
	inTx       bool
}

func newTxRefreshStore(rows ...*auth.RefreshRecord) *txRefreshStore {
	s := &txRefreshStore{rows: map[string]*auth.RefreshRecord{}, revAll: map[string]int{}}
	for _, r := range rows {
		cp := *r
		if r.RevokedAt != nil {
			ts := *r.RevokedAt
			cp.RevokedAt = &ts
		}
		s.rows[auth.HashRefresh("tok-"+r.ID)] = &cp
	}
	return s
}

func (s *txRefreshStore) Create(_ context.Context, userID, tokenHash string, expiresAt time.Time) error {
	if s.inTx && s.failCreate {
		return errors.New("crash after revoke")
	}
	s.rows[tokenHash] = &auth.RefreshRecord{ID: "row-" + tokenHash[:8], UserID: userID, ExpiresAt: expiresAt}
	return nil
}
func (s *txRefreshStore) Revoke(_ context.Context, tokenHash string) error {
	rec := s.rows[tokenHash]
	if rec == nil {
		return apperrors.Unauthorized("token_invalid", errors.New("miss"))
	}
	now := time.Now()
	rec.RevokedAt = &now
	return nil
}
func (s *txRefreshStore) RevokeAllForUser(_ context.Context, userID string) error {
	s.revAll[userID]++
	for _, rec := range s.rows {
		if rec.UserID == userID && rec.RevokedAt == nil {
			now := time.Now()
			rec.RevokedAt = &now
		}
	}
	return nil
}
func (s *txRefreshStore) lookup(hash string) (*auth.RefreshRecord, error) {
	rec, ok := s.rows[hash]
	if !ok {
		return nil, apperrors.Unauthorized("token_invalid", errors.New("miss"))
	}
	cp := *rec
	if rec.RevokedAt != nil {
		ts := *rec.RevokedAt
		cp.RevokedAt = &ts
	}
	return &cp, nil
}
func (s *txRefreshStore) GetByHash(_ context.Context, hash string) (*auth.RefreshRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lookup(hash)
}
func (s *txRefreshStore) GetByHashForUpdate(_ context.Context, hash string) (*auth.RefreshRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lookup(hash)
}
func (s *txRefreshStore) Transaction(_ context.Context, fn func(auth.RefreshStore) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Deep-copy rows into the tx so mutations inside fn never leak past a
	// rollback; commit swaps the copy back in.
	txRows := map[string]*auth.RefreshRecord{}
	for h, r := range s.rows {
		cp := *r
		if r.RevokedAt != nil {
			ts := *r.RevokedAt
			cp.RevokedAt = &ts
		}
		txRows[h] = &cp
	}
	txRevAll := map[string]int{}
	for k, v := range s.revAll {
		txRevAll[k] = v
	}
	tx := &txRefreshStore{rows: txRows, revAll: txRevAll, failCreate: s.failCreate, inTx: true}
	if err := fn(tx); err != nil {
		return err
	}
	s.rows = txRows
	s.revAll = txRevAll
	return nil
}
func (s *txRefreshStore) CleanExpired(context.Context, time.Time) (int64, error) {
	return 0, nil
}
func (s *txRefreshStore) StartCleanup(context.Context, time.Duration, time.Duration) func() {
	return func() {}
}

type txUserRepo struct {
	user *entity.User
}

func (r *txUserRepo) Create(context.Context, *entity.User) error { return nil }
func (r *txUserRepo) GetByID(_ context.Context, id string) (*entity.User, error) {
	if r.user != nil && r.user.ID == id {
		clone := *r.user
		return &clone, nil
	}
	return nil, apperrors.NotFound("not_found", nil)
}
func (r *txUserRepo) GetByEmail(context.Context, string) (*entity.User, error) {
	return nil, apperrors.NotFound("not_found", nil)
}
func (r *txUserRepo) List(context.Context, repository.UserFilter, int, int) (*repository.Paginated[entity.User], error) {
	return &repository.Paginated[entity.User]{}, nil
}
func (r *txUserRepo) Update(context.Context, *entity.User) error { return nil }
func (r *txUserRepo) Delete(context.Context, string) error       { return nil }
func (r *txUserRepo) HardDelete(context.Context, string) error   { return nil }
func (r *txUserRepo) Approve(context.Context, string, string) (*entity.User, error) {
	return nil, nil
}
func (r *txUserRepo) Reject(context.Context, string, string, string) (*entity.User, error) {
	return nil, nil
}
func (r *txUserRepo) Deactivate(context.Context, string) (*entity.User, error) { return nil, nil }
func (r *txUserRepo) UpdatePassword(context.Context, string, string) error     { return nil }
func (r *txUserRepo) ClearMustChangePassword(context.Context, string) error    { return nil }
func (r *txUserRepo) ListApproversForTenant(context.Context, string) ([]entity.User, error) {
	return nil, nil
}

func refreshTestJWT() *auth.JWTManager {
	return auth.NewJWTManager(&config.Config{
		JWTSecret:     "ar6-test-secret",
		JWTAccessTTL:  15 * time.Minute,
		JWTRefreshTTL: time.Hour,
	})
}

func refreshTestUser() *entity.User {
	return &entity.User{
		BaseModel:      entity.BaseModel{ID: "user-ar6"},
		Email:          "ar6@kidversa.test",
		Role:           entity.RoleFasilitator,
		IsActive:       true,
		ApprovalStatus: entity.ApprovalApproved,
	}
}

// revokedRow builds a store row for recID revoked agoAgo (nil agoAgo = live).
func revokedRow(recID, userID string, revokedAgo *time.Duration, now time.Time) *auth.RefreshRecord {
	rec := &auth.RefreshRecord{ID: recID, UserID: userID, ExpiresAt: now.Add(time.Hour)}
	if revokedAgo != nil {
		ts := now.Add(-*revokedAgo)
		rec.RevokedAt = &ts
	}
	return rec
}

// Fake-clock boundary sweep: revoked 5s ago → grace (401, family intact);
// revoked W-1/W/W+1 → grace/grace/kill; revoked 60s ago → kill.
func TestRefresh_ReuseGraceBoundaries(t *testing.T) {
	W := auth.RefreshReuseGracePeriod
	now := time.Now()
	cases := []struct {
		name       string
		revokedAgo time.Duration
		wantKill   bool
	}{
		{"revoked-5s grace", 5 * time.Second, false},
		{"boundary W-1 grace", W - time.Second, false},
		{"boundary W grace", W, false},
		{"boundary W+1 kill", W + time.Second, true},
		{"revoked-60s kill", 60 * time.Second, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newTxRefreshStore(revokedRow("r1", "user-ar6", &tc.revokedAgo, now))
			revoker := auth.NewInMemoryRevoker()
			t.Cleanup(revoker.Stop)
			uc := auth.NewUsecase(&txUserRepo{user: refreshTestUser()}, refreshTestJWT(), revoker, store, 4)
			uc.SetClock(func() time.Time { return now })

			_, err := uc.Refresh(context.Background(), "tok-r1")
			if _, code, ok := apperrors.AsAppError(err); !ok || code != "token_invalid" {
				t.Fatalf("expected 401/token_invalid, got %v", err)
			}
			if got := store.revAll["user-ar6"]; tc.wantKill && got != 1 {
				t.Errorf("want family kill (revAll=1), got %d", got)
			}
			if got := store.revAll["user-ar6"]; !tc.wantKill && got != 0 {
				t.Errorf("want family intact (revAll=0), got %d", got)
			}
		})
	}
}

// Crash-after-revoke: Create fails inside tx → predecessor NOT revoked +
// retry (with Create healthy) succeeds.
func TestRefresh_CrashAfterRevoke_RollsBackAndRetrySucceeds(t *testing.T) {
	now := time.Now()
	store := newTxRefreshStore(revokedRow("r1", "user-ar6", nil, now))
	store.failCreate = true
	revoker := auth.NewInMemoryRevoker()
	t.Cleanup(revoker.Stop)
	uc := auth.NewUsecase(&txUserRepo{user: refreshTestUser()}, refreshTestJWT(), revoker, store, 4)
	uc.SetClock(func() time.Time { return now })

	if _, err := uc.Refresh(context.Background(), "tok-r1"); err == nil {
		t.Fatal("expected crash error, got nil")
	} else if _, code, ok := apperrors.AsAppError(err); !ok || code != "internal_error" {
		t.Fatalf("expected internal_error, got %v", err)
	}
	// Predecessor must NOT be revoked — the tx rolled back.
	live := store.rows[auth.HashRefresh("tok-r1")]
	if live == nil || live.RevokedAt != nil {
		t.Fatal("predecessor revoked despite rolled-back tx — retry would strand the client")
	}

	// Retry with a healthy store succeeds.
	store.failCreate = false
	res, err := uc.Refresh(context.Background(), "tok-r1")
	if err != nil {
		t.Fatalf("retry Refresh: %v", err)
	}
	if res == nil || res.AccessToken == "" || res.RefreshToken == "" {
		t.Fatal("retry did not issue a token pair")
	}
}

// sqlmock: rotation runs BEGIN → SELECT..FOR UPDATE → UPDATE → INSERT → COMMIT.
func TestRefreshRepo_TxRotation_Ordering(t *testing.T) {
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{})
	if err != nil {
		t.Fatalf("gorm open: %v", err)
	}
	repo := persistence.NewGormRefreshRepository(db)
	ctx := context.Background()

	mock.ExpectBegin()
	cols := []string{"id", "user_id", "token_hash", "expires_at", "revoked_at", "created_at", "updated_at"}
	mock.ExpectQuery("SELECT .*refresh_tokens.*FOR UPDATE").
		WithArgs("hash-live", 1).
		WillReturnRows(sqlmock.NewRows(cols).
			AddRow("row-1", "user-ar6", "hash-live", time.Now().Add(time.Hour), nil, time.Now(), time.Now()))
	mock.ExpectExec("UPDATE .*refresh_tokens.*revoked_at").
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), "hash-live").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO .*refresh_tokens").
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	err = repo.Transaction(ctx, func(tx auth.RefreshStore) error {
		if _, err := tx.GetByHashForUpdate(ctx, "hash-live"); err != nil {
			return err
		}
		if err := tx.Revoke(ctx, "hash-live"); err != nil {
			return err
		}
		return tx.Create(ctx, "user-ar6", "hash-next", time.Now().Add(time.Hour))
	})
	if err != nil {
		t.Fatalf("tx rotation: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sqlmock expectations: %v", err)
	}
}

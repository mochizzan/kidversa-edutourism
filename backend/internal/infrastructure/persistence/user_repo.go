package persistence

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	"kidversa-edutourism-backend/internal/domain/entity"
	"kidversa-edutourism-backend/internal/domain/repository"
	apperrors "kidversa-edutourism-backend/internal/pkg/errors"
)

// GormUserRepository implements repository.UserRepository.
type GormUserRepository struct {
	db *gorm.DB
}

// NewUserRepository builds a GORM-backed user repository.
func NewUserRepository(db *gorm.DB) repository.UserRepository {
	return &GormUserRepository{db: db}
}

func (r *GormUserRepository) Create(ctx context.Context, u *entity.User) error {
	m := userModelFromEntity(u)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	*u = *m.ToEntity()
	return nil
}

func (r *GormUserRepository) GetByID(ctx context.Context, id string) (*entity.User, error) {
	var m UserModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormUserRepository) GetByEmail(ctx context.Context, email string) (*entity.User, error) {
	var m UserModel
	if err := r.db.WithContext(ctx).Where("email = ?", strings.ToLower(email)).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormUserRepository) List(ctx context.Context, f repository.UserFilter, page, limit int) (*repository.Paginated[entity.User], error) {
	q := r.db.WithContext(ctx).Model(&UserModel{})
	if f.TenantID != "" {
		q = q.Where("tenant_id = ?", f.TenantID)
	}
	if f.Role != "" {
		q = q.Where("role = ?", f.Role)
	}
	if f.ApprovalStatus != "" {
		q = q.Where("approval_status = ?", f.ApprovalStatus)
	}
	if f.IsActive != nil {
		q = q.Where("is_active = ?", *f.IsActive)
	}
	if f.Search != "" {
		like := "%" + strings.ToLower(f.Search) + "%"
		q = q.Where("LOWER(name) LIKE ? OR LOWER(email) LIKE ?", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}

	var models []UserModel
	offset := (page - 1) * limit
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	items := make([]entity.User, 0, len(models))
	for i := range models {
		items = append(items, *models[i].ToEntity())
	}
	return &repository.Paginated[entity.User]{Items: items, Total: int(total)}, nil
}

func (r *GormUserRepository) ListApproversForTenant(ctx context.Context, tenantID string) ([]entity.User, error) {
	q := r.db.WithContext(ctx).Model(&UserModel{}).
		Where("approval_status = ?", entity.ApprovalApproved).
		Where("is_active = ?", true)
	if tenantID != "" {
		q = q.Where("(role = ?) OR (role = ? AND tenant_id = ?)", entity.RoleSuperAdmin, entity.RoleAdmin, tenantID)
	} else {
		q = q.Where("role = ?", entity.RoleSuperAdmin)
	}
	var models []UserModel
	if err := q.Find(&models).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	out := make([]entity.User, 0, len(models))
	for i := range models {
		out = append(out, *models[i].ToEntity())
	}
	return out, nil
}

func (r *GormUserRepository) Update(ctx context.Context, u *entity.User) error {
	m := userModelFromEntity(u)
	if err := r.db.WithContext(ctx).Model(&UserModel{}).Where("id = ?", u.ID).Updates(m).Error; err != nil {
		if isDuplicate(err) {
			return apperrors.Conflict("conflict", err)
		}
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormUserRepository) Delete(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Delete(&UserModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// HardDelete permanently removes a user row, bypassing GORM's soft-delete scope.
// It first clears the FK RESTRICT reference (sessions.created_by) so the hard
// delete does not fail, then runs a real DELETE. MariaDB then applies the
// ON DELETE CASCADE (refresh_tokens, notifications) and ON DELETE SET NULL
// (users.approved_by / users.rejected_by) constraints automatically.
func (r *GormUserRepository) HardDelete(ctx context.Context, id string) error {
	// Release FK RESTRICT: sessions.created_by -> NULL. A rejected/pending user
	// normally owns no sessions, but handle it so the hard delete never fails.
	if err := r.db.WithContext(ctx).
		Model(&SessionModel{}).Where("created_by = ?", id).
		Update("created_by", nil).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	// Real deletion (skip GORM soft-delete scope).
	if err := r.db.WithContext(ctx).
		Unscoped().Delete(&UserModel{}, "id = ?", id).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

func (r *GormUserRepository) Approve(ctx context.Context, id, approverID string) (*entity.User, error) {
	var m UserModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	now := time.Now().Format("2006-01-02 15:04:05.000")
	m.IsActive = true
	m.ApprovalStatus = entity.ApprovalApproved
	m.ApprovedAt = &now
	m.ApprovedBy = &approverID
	m.RejectedAt = nil
	m.RejectedBy = nil
	m.RejectionReason = ""
	if err := r.db.WithContext(ctx).Model(&UserModel{}).Where("id = ?", id).Updates(m).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormUserRepository) Reject(ctx context.Context, id, approverID, reason string) (*entity.User, error) {
	var m UserModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	now := time.Now().Format("2006-01-02 15:04:05.000")
	m.IsActive = false
	m.ApprovalStatus = entity.ApprovalRejected
	m.RejectedAt = &now
	m.RejectedBy = &approverID
	m.RejectionReason = reason
	m.ApprovedAt = nil
	m.ApprovedBy = nil
	if err := r.db.WithContext(ctx).Model(&UserModel{}).Where("id = ?", id).Updates(m).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

func (r *GormUserRepository) Deactivate(ctx context.Context, id string) (*entity.User, error) {
	var m UserModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.NotFound("not_found", err)
		}
		return nil, apperrors.Internal("internal_error", err)
	}
	m.IsActive = false
	if err := r.db.WithContext(ctx).Model(&UserModel{}).Where("id = ?", id).Updates(m).Error; err != nil {
		return nil, apperrors.Internal("internal_error", err)
	}
	return m.ToEntity(), nil
}

// UpdatePassword sets a new bcrypt password hash for the user.
func (r *GormUserRepository) UpdatePassword(ctx context.Context, id, hash string) error {
	if err := r.db.WithContext(ctx).Model(&UserModel{}).
		Where("id = ?", id).Update("password_hash", hash).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

// ClearMustChangePassword turns off the forced password-change flag.
func (r *GormUserRepository) ClearMustChangePassword(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Model(&UserModel{}).
		Where("id = ?", id).Update("must_change_password", false).Error; err != nil {
		return apperrors.Internal("internal_error", err)
	}
	return nil
}

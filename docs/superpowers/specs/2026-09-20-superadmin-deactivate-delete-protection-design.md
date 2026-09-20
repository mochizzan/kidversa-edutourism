# Design: Protect SUPER_ADMIN Accounts From Deactivation & Deletion

- **Date:** 2026-09-20
- **Status:** Approved (Approach A, defense-in-depth)
- **Owner:** Brainstoming → writing-plans handoff
- **Repo:** Kidversa Edutourism (`/admin/users?filter=all`)

## Context & Problem

On the admin **Users** page (`/admin/users?filter=all`), every approved + active user row renders two admin-only action buttons:

- **Nonaktifkan** (`Ban` icon) → `POST /api/users/:id/deactivate`
- **Hapus** (`Trash2` icon) → `DELETE /api/users/:id`

Both buttons render for **any** approved+active user, **including `SUPER_ADMIN`-role accounts**. The delete button additionally excludes self (`item.id !== currentUser?.id`), but neither has a role guard.

**Impact of the gap:**

1. **Self-deactivation** — a superadmin can click Nonaktifkan on their own row (no self-exclusion guard on deactivate).
2. **Cross-superadmin deactivation/deletion** — a superadmin can deactivate or delete another superadmin account.
3. **Direct API bypass** — the route `POST /:id/deactivate` is gated only on the *actor* role (`RequireRole(SUPER_ADMIN)`); the *target* role is never checked. A superadmin caller can hit it via curl/devtools, bypassing a UI-only guard.

**Why this is dangerous:** `auth.Usecase.Login` rejects any `!user.IsActive` or non-approved user with `invalid_credentials` (so a deactivated account cannot log in at all). Deactivating the last/first superadmin → **platform lockout** with no in-app recovery path.

## Policy Decision

> A `SUPER_ADMIN`-role account **cannot be deactivated and cannot be deleted**. It remains readable and editable (name/phone/role). All other roles are unaffected.

This is enforced **in depth**:

- **Frontend** hides the actionable buttons for SUPER_ADMIN targets (UX).
- **Backend** rejects the operations even when invoked directly (security).

## Approaches Considered

| # | Approach | Verdict |
|---|----------|---------|
| A | Hide buttons in UI **and** enforce in backend usecase (dedicated error codes) | ✅ Chosen |
| B | Backend-only; leave buttons visible but return 403 on click | ❌ Bad UX, same backend complexity |
| C | Demote SUPER_ADMIN → ADMIN before deactivate/delete | ❌ Over-engineered, changes role semantics, still risks lockout |

## Detailed Design — Approach A

### Scope (4 files)

1. `frontend/src/features/admin/pages/UsersPage.tsx`
2. `backend/internal/infrastructure/auth/usecase_users.go`
3. `backend/internal/pkg/response/response.go` (`MessageForCode`)
4. `backend/tests/users_usecase_test.go`

### Frontend — `UsersPage.tsx`

In the `actions` column `render`, split the approved+active block so **Edit** always renders, while the action buttons gain a SUPER_ADMIN guard:

```tsx
const isSuperAdminTarget = item.role === UserRole.SUPER_ADMIN

// ... inside isApprovedActive branch:
{isSuperAdminTarget ? (
  <Link to={`/admin/users/${item.id}/edit`}>
    <Button variant="ghost" size="sm" icon={<Pencil .../>} tooltip="Edit" />
  </Link>
) : (
  <>
    <Link to={`/admin/users/${item.id}/edit`}>
      <Button variant="ghost" size="sm" icon={<Pencil .../>} tooltip="Edit" />
    </Link>
    <Button
      variant="ghost"
      size="sm"
      icon={<Ban className="w-4 h-4 text-error" />}
      tooltip="Nonaktifkan"
      onClick={() => setDeactivateId(item.id)}
    />
  </>
)}

// Delete button guard becomes:
{isSuperAdminView && item.id !== currentUser?.id && !isSuperAdminTarget && (
  <Button variant="ghost" size="sm" icon={<Trash2 .../>} tooltip="Hapus" onClick={() => setDeleteId(item.id)} />
)}
```

(`UserRole` is already imported on line 16.)

### Backend — `usecase_users.go`

**Constants:** reuse `entity.RoleSuperAdmin` for the check.

**`DeactivateUser`** — fetch target before deactivating; reject if it is a SUPER_ADMIN:

```go
func (u *UserUsecase) DeactivateUser(ctx context.Context, id string) (*entity.User, error) {
    user, err := u.users.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }
    if user.Role == entity.RoleSuperAdmin {
        return nil, apperrors.Forbidden("user_not_deactivatable",
            errors.New("superadmin tidak dapat dinonaktifkan"))
    }
    return u.users.Deactivate(ctx, id)
}
```

**`DeleteUser`** — fetch the target unconditionally (currently only fetched for non-SA actors) so the role guard applies to SA callers too; reject then fall through to tenant scope + hard delete:

```go
func (u *UserUsecase) DeleteUser(ctx context.Context, id, actorRole, actorTenantID string) error {
    user, err := u.users.GetByID(ctx, id)
    if err != nil {
        return err
    }
    if user.Role == entity.RoleSuperAdmin {
        return apperrors.Forbidden("user_not_deletable",
            errors.New("superadmin tidak dapat dihapus"))
    }
    if actorRole != string(entity.RoleSuperAdmin) && !sameTenant(user.TenantID, actorTenantID) {
        return apperrors.Forbidden("forbidden", errors.New("cross-tenant access"))
    }
    return u.users.HardDelete(ctx, id)
}
```

### Errors — `response.go` `MessageForCode`

Add two cases (mirrors existing `session_not_deletable` / `participant_not_deletable` precedent):

```go
case "user_not_deactivatable":
    return "Akun ini tidak dapat dinonaktifkan"
case "user_not_deletable":
    return "Akun ini tidak dapat dihapus"
```

### Tests — `tests/users_usecase_test.go`

Two pure unit tests over `fakeUserRepo` (package `auth_test`), following the existing `TestUpdateUser_*` style and `requireAppErrorCode` helper:

- `TestDeactivateUser_SuperAdmin_Protected` — pre-seeded SA target → assert code `user_not_deactivatable`.
- `TestDeleteUser_SuperAdmin_Protected` — SA actor deleting an SA target → assert code `user_not_deletable`.
- Positive control: `TestDeactivateUser_NormalUser_Allowed` — non-SA approved+active target deactivates without error (ensure no over-block).

## Out of Scope

- UserFormPage / edit flow unchanged; superadmin role-downgrade on edit is explicitly **allowed** per "read + edit only".
- No migrations (no schema change; `is_active`/`role` columns unchanged).
- No change to route middleware in `router_users.go` (SUPER_ADMIN-only deactivation/deletion is already correct at the transport layer; the new guard is on the *target*).

## Acceptance Criteria

1. SUPER_ADMIN row shows **Edit** but no **Nonaktifkan / Hapus** buttons.
2. `POST /api/users/<sa-id>/deactivate` by a superadmin → `403 { "error": { "code": "user_not_deactivatable", "message": "..." } }`.
3. `DELETE /api/users/<sa-id>` by a superadmin → `403 { "error": { "code": "user_not_deletable", "message": "..." } }`.
4. Normal (ADMIN/KOORDINATOR/FASILITATOR) deactivated/deleted paths unchanged.
5. `gofmt -l .` empty, `go vet ./...` clean, `go build ./...` ok.
6. New unit tests pass (`go test ./...`).

## Security Notes

- Defense in depth: UI hiding is convenience; the usecase guard is authoritative. The route still requires `SUPER_ADMIN` on the actor, so the *target* guard is the new safety rail.
- Error uses `Forbidden` (403), not 404 — a superadmin caller is authorized to *know* the account exists; we deny the action. (Consistent with `UpdateUser`'s `forbidden` usage.)
- No new privilege surface: we only *restrict*; edit remains as-is.

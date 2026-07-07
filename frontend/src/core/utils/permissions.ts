import { UserRole } from '../types/enums'
import type { User } from '../types'

export function isSuperAdmin(user: User | null): boolean {
  return user?.role === UserRole.SUPER_ADMIN
}

export function isAdmin(user: User | null): boolean {
  return user?.role === UserRole.ADMIN
}

export function isKoordinator(user: User | null): boolean {
  return user?.role === UserRole.KOORDINATOR
}

export function isFasilitator(user: User | null): boolean {
  return user?.role === UserRole.FASILITATOR
}

export function canManageTenants(user: User | null): boolean {
  return isSuperAdmin(user)
}

export function canApproveUser(approver: User | null, targetTenantId: string | null | undefined): boolean {
  if (!approver) return false
  if (isSuperAdmin(approver)) return true
  if (isAdmin(approver)) {
    return approver.tenant_id === targetTenantId
  }
  return false
}

export function canAccessTenantOperationalData(user: User | null): boolean {
  if (!user) return false
  return [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR].includes(user.role)
}

export function getTenantScope(user: User | null): string | null {
  if (!user) return null
  if (isSuperAdmin(user)) return null
  return user.tenant_id || null
}

export function requiresActiveTenant(user: User | null): boolean {
  return isSuperAdmin(user)
}

export function getApprovalNotificationRoles(): UserRole[] {
  return [UserRole.SUPER_ADMIN, UserRole.ADMIN]
}

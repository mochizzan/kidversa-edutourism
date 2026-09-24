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

export interface RouteAccess {
  path: string
  roles: readonly UserRole[]
  section: string
  tenantFree?: boolean
}

// Literal `as const` gives `path`/`section` a literal union so AdminLayout can
// index its sidebar label-key maps with compile-time missing-key detection.
export const ADMIN_ROUTE_ACCESS = [
  { path: 'dashboard', section: 'OVERVIEW', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'live', section: 'OVERVIEW', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'programs', section: 'PROGRAM', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'topics', section: 'PROGRAM', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'activities', section: 'PROGRAM', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'sessions', section: 'PROGRAM', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'participants', section: 'PROGRAM', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'reports', section: 'PROGRAM', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'missions', section: 'PROGRAM', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'content', section: 'CONTENT', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
  { path: 'frames', section: 'CONTENT', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
  { path: 'tenants', section: 'SETTINGS', roles: [UserRole.SUPER_ADMIN] },
  { path: 'users', section: 'SETTINGS', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
  { path: 'consent', section: 'SETTINGS', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
] as const

export function getRouteAccess(segment: string): RouteAccess | undefined {
  return ADMIN_ROUTE_ACCESS.find((r) => r.path === segment)
}

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
  label: string
  roles: UserRole[]
  tenantFree?: boolean
  section: string
}

export const ADMIN_ROUTE_ACCESS: RouteAccess[] = [
  { path: 'dashboard', section: 'OVERVIEW', label: 'Dashboard', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'live', section: 'OVERVIEW', label: 'Live Monitor', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'programs', section: 'PROGRAM', label: 'Programs', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'sessions', section: 'PROGRAM', label: 'Sessions', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'participants', section: 'PROGRAM', label: 'Peserta', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'reports', section: 'PROGRAM', label: 'Reports', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'missions', section: 'PROGRAM', label: 'Missions', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
  { path: 'content', section: 'CONTENT', label: 'Content Manager', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
  { path: 'frames', section: 'CONTENT', label: 'Frame Manager', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
  { path: 'recordings', section: 'CONTENT', label: 'Recordings', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
  { path: 'tenants', section: 'SETTINGS', label: 'Tenants', roles: [UserRole.SUPER_ADMIN], tenantFree: true },
  { path: 'users', section: 'SETTINGS', label: 'Users', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
  { path: 'consent', section: 'SETTINGS', label: 'Consent Monitor', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.KOORDINATOR] },
]

export function getRouteAccess(segment: string): RouteAccess | undefined {
  return ADMIN_ROUTE_ACCESS.find((r) => r.path === segment)
}

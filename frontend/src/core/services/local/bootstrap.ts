import { getAll, put } from '../storage/idb'
import type { User, Tenant } from '../../types'
import { UserRole, ApprovalStatus } from '../../types'

export const BOOTSTRAP_PASSWORD = 'password123'

export const BOOTSTRAP_TENANTS: Tenant[] = [
  {
    id: 'tenant-bandung',
    name: 'Bandung',
    slug: 'bandung',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tenant-subang',
    name: 'Subang',
    slug: 'subang',
    created_at: '2026-01-01T00:00:00.000Z',
  },
]

export const BOOTSTRAP_USERS: User[] = [
  {
    id: 'user-superadmin',
    tenant_id: null,
    email: 'superadmin@kidversa.id',
    password_hash: BOOTSTRAP_PASSWORD,
    role: UserRole.SUPER_ADMIN,
    name: 'Super Admin',
    is_active: true,
    approval_status: ApprovalStatus.APPROVED,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-admin-bandung',
    tenant_id: 'tenant-bandung',
    email: 'admin.bandung@kidversa.id',
    password_hash: BOOTSTRAP_PASSWORD,
    role: UserRole.ADMIN,
    name: 'Admin Bandung',
    phone: '081234567890',
    is_active: true,
    approval_status: ApprovalStatus.APPROVED,
    created_at: '2026-01-01T00:00:00.000Z',
  },
]

const BOOTSTRAP_FLAG = 'kidversa_idb_bootstrapped_v2'

export async function markBootstrapped(): Promise<void> {
  localStorage.setItem(BOOTSTRAP_FLAG, 'true')
}

export async function runBootstrap(): Promise<void> {
  const existingTenants = await getAll<Tenant>('tenants')
  const existingTenantIds = new Set(existingTenants.map(t => t.id))

  for (const tenant of BOOTSTRAP_TENANTS) {
    if (!existingTenantIds.has(tenant.id)) {
      await put('tenants', tenant)
    }
  }

  const existingUsers = await getAll<User>('users')
  const existingUserIds = new Set(existingUsers.map(u => u.id))

  for (const bUser of BOOTSTRAP_USERS) {
    if (!existingUserIds.has(bUser.id)) {
      await put('users', bUser)
    }
  }

  await markBootstrapped()
}

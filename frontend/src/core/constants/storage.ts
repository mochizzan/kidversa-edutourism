// storage.ts — single source of truth for localStorage / sessionStorage keys.
export const STORAGE_KEYS = {
  ACTIVE_TENANT_ID: 'kidversa_active_tenant_id',
  USER: 'kidversa_user',
  LOGIN_ATTEMPTS: 'kidversa_login_attempts',
  LOCKOUT_UNTIL: 'kidversa_lockout_until',
} as const

export const ACTIVE_TENANT_KEY = STORAGE_KEYS.ACTIVE_TENANT_ID
export const KIDVERSA_USER = STORAGE_KEYS.USER

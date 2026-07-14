// apiEnvelope.ts — shared helpers for the backend-API service shims (Fase 4).
//
// Every backend response is wrapped as `{ data, meta? }` (see backend/pkg/response).
// List endpoints include `meta: { page, limit, total }`; single-item endpoints
// return just `{ data }`; mutations may return 204 (no body).
//
// These helpers:
//  - unwrap the envelope,
//  - flatten `meta` into the FE `PaginatedResponse` shape ({total,page,limit,totalPages}),
//  - loop pagination (EC9) when the caller asks for a large page (>=100, the backend cap),
//  - normalize `tenant_id` null/undefined → '' (C7),
//  - attach the `X-Tenant-Id` header for SUPER_ADMIN (backend TenantScope requires it).

import { ApiError, apiRequest, getStoredUser } from './backendClient'
import type { ListParams, PaginatedResponse } from '../types'
import { STORAGE_KEYS } from '../constants/storage'
import { UserRole } from '../types/enums'

const ACTIVE_TENANT_KEY = STORAGE_KEYS.ACTIVE_TENANT_ID

interface ListEnvelope<T> {
  data: T[]
  meta: { page: number; limit: number; total: number }
}

interface ItemEnvelope<T> {
  data: T
}

// Some list endpoints wrap the array one level deeper as `{ data: { items: [] } }`
// (reports, consent, participant-missions). This envelope models that shape.
interface ItemsEnvelope<T> {
  data: { items: T[] }
}

// For SUPER_ADMIN the backend requires an explicit X-Tenant-Id header to scope
// tenant data; other roles are scoped strictly from the JWT and MUST NOT send it
// (the middleware rejects it). The active tenant lives in localStorage (set by
// tenantStore); the current role comes from the persisted auth user.
export function withTenantHeader(headers: Record<string, string> = {}): Record<string, string> {
  const user = getStoredUser<{ role?: string }>()
  if (user?.role === UserRole.SUPER_ADMIN) {
    const tid =
      typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_TENANT_KEY) : null
    if (tid) return { ...headers, 'X-Tenant-Id': tid }
  }
  return headers
}

// C7: the backend omits `tenant_id` (omitempty) for tenant-less scopes; the FE
// entity types expect a string, so normalize null/undefined → ''.
export function normalizeTenantId<T>(item: T): T {
  if (item && typeof item === 'object' && !Array.isArray(item) && 'tenant_id' in item) {
    const v = (item as Record<string, unknown>).tenant_id
    if (v === null || v === undefined) {
      return { ...(item as Record<string, unknown>), tenant_id: '' } as T
    }
  }
  return item
}

function buildQuery(path: string, params?: ListParams): string {
  const limit = Math.max(1, params?.limit ?? 10)
  const page = Math.max(1, params?.page ?? 1)
  const query = new URLSearchParams()
  query.set('page', String(page))
  query.set('limit', String(limit))
  if (params?.search) query.set('search', params.search)
  if (params?.sort) query.set('sort', params.sort)
  if (params?.order) query.set('order', params.order)
  if (params?.filters) {
    for (const [k, v] of Object.entries(params.filters)) {
      if (v !== undefined && v !== '') query.set(k, String(v))
    }
  }
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

// GET a paginated list, honoring the FE pagination contract. When the caller
// requests a large page (>=100, the backend's hard cap) we loop every page so
// callers that rely on "fetch all" (e.g. limit:1000) actually receive everything.
export async function listRequest<T>(
  path: string,
  params?: ListParams,
): Promise<PaginatedResponse<T>> {
  const limit = Math.max(1, params?.limit ?? 10)
  const page = Math.max(1, params?.page ?? 1)
  const url = buildQuery(path, params)

  const first = await apiRequest<ListEnvelope<T>>('GET', url, undefined, {
    headers: withTenantHeader(),
  })

  if (limit >= 100 && first.meta && first.meta.total > first.data.length) {
    const totalPages = Math.ceil(first.meta.total / first.meta.limit)
    const rest: T[] = []
    for (let p = page + 1; p <= totalPages; p++) {
      const q = new URLSearchParams(
        url.includes('?') ? url.slice(url.indexOf('?') + 1) : '',
      )
      q.set('page', String(p))
      const r = await apiRequest<ListEnvelope<T>>(
        'GET',
        `${path}?${q.toString()}`,
        undefined,
        { headers: withTenantHeader() },
      )
      rest.push(...r.data)
    }
    const all = [...first.data, ...rest].map(normalizeTenantId)
    return { data: all, total: first.meta.total, page: 1, limit: all.length, totalPages: 1 }
  }

  return {
    data: first.data.map(normalizeTenantId),
    total: first.meta?.total ?? first.data.length,
    page: first.meta?.page ?? page,
    limit: first.meta?.limit ?? limit,
    totalPages: first.meta ? Math.ceil(first.meta.total / first.meta.limit) : 1,
  }
}

// GET an array (sub-resource list, e.g. stages/contents/groups/participants).
export async function arrayRequest<T>(method: string, path: string, body?: unknown): Promise<T[]> {
  const res = await apiRequest<ItemEnvelope<T[]>>(method, path, body, {
    headers: withTenantHeader(),
  })
  return (res.data ?? []).map(normalizeTenantId)
}

// GET/POST a list wrapped as `{ data: { items: [] } }` (reports, consent,
// participant-missions). Unwraps the nested `items` array and normalizes
// tenant_id. Routes through withTenantHeader so tenant scoping is applied.
export async function itemsRequest<T>(method: string, path: string, body?: unknown): Promise<T[]> {
  const res = await apiRequest<ItemsEnvelope<T>>(method, path, body, {
    headers: withTenantHeader(),
  })
  return (res.data?.items ?? []).map(normalizeTenantId)
}

// GET/POST/PUT a single item; returns the unwrapped `data` (tenant_id normalized).
export async function itemRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await apiRequest<ItemEnvelope<T>>(method, path, body, {
    headers: withTenantHeader(),
  })
  return normalizeTenantId(res.data)
}

// GET a single item that may not exist; returns the unwrapped `data` or null on 404.
export async function nullableItemRequest<T>(method: string, path: string): Promise<T | null> {
  try {
    return await itemRequest<T>(method, path)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

// DELETE / mutation with no body of interest.
export async function voidRequest(method: string, path: string, body?: unknown): Promise<void> {
  await apiRequest<unknown>(method, path, body, { headers: withTenantHeader() })
}

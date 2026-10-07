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

import { ApiError, apiRequest } from './backend-client'
import type { ListParams, PaginatedResponse } from '../types'
import { PAGE_SIZE } from '../constants/api'
import { i18n } from '../i18n'

// A 2xx body that is not the documented envelope is a server/proxy fault:
// reject with a user-facing error instead of unwrapping junk, so a malformed
// response never renders as an empty list or a fake not-found.
function unexpectedEnvelope(path: string): ApiError {
  console.error(`[api-envelope] unexpected response envelope for ${path}`)
  return new ApiError(i18n.t('errors.default'), 'unexpected_response', 502)
}

interface ListEnvelope<T> {
  data: T[]
  meta: { page: number; limit: number; total: number }
}

interface ItemEnvelope<T> {
  data: T
}

// Some list endpoints wrap the array one level deeper as `{ data: { items: [] } }`
// (reports, consent, participant-missions, mission-banks). This envelope models
// that shape.
interface ItemsEnvelope<T> {
  data: { items: T[] }
}

// Like ItemsEnvelope, but the list endpoint also carries top-level pagination
// meta (e.g. /api/mission-banks). Exported so service shims reuse the shared
// type instead of re-declaring a divergent local envelope.
export interface ItemsListEnvelope<T> {
  data: { items: T[] }
  meta?: { page: number; limit: number; total: number }
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
  const limit = Math.max(1, params?.limit ?? PAGE_SIZE)
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

// Opt-in fetch controls for list shims. `fetchAll === undefined` preserves the
// legacy trigger (fan-out when limit >= 100); pass `fetchAll: false` for an
// explicit single page. `signal` aborts in-flight page fetches (forwarded to
// apiRequest) and stops `fetchAllPages` between pages.
export interface ListFetchOpts {
  fetchAll?: boolean
  signal?: AbortSignal
}

// Single source of truth for pagination traversal (EC9). Given a `requestFn`
// that fetches one page (by 1-based page number) and resolves to `{ data, meta? }`,
// loop until the full working set is gathered. Stops when the page is empty,
// shorter than the requested limit, once `meta.total` items have accumulated,
// or when `opts.signal` aborts between pages.
// `startPage` lets a caller that already fetched page 1 resume from page 2+.
export async function fetchAllPages<T>(
  requestFn: (page: number) => Promise<{ data: T[]; meta?: { page: number; limit: number; total: number } }>,
  startPage = 1,
  opts?: ListFetchOpts,
): Promise<T[]> {
  const all: T[] = []
  let page = startPage
  // Guard with a sane upper bound so a misbehaving backend can never loop forever.
  for (let safety = 0; safety < 1000; safety++) {
    if (opts?.signal?.aborted) break
    const res = await requestFn(page)
    const items = res.data ?? []
    all.push(...items)
    const meta = res.meta
    if (!meta || items.length === 0 || all.length >= meta.total) break
    if (items.length < meta.limit) break
    page += 1
  }
  return all
}

// GET a paginated list, honoring the FE pagination contract. When the caller
// requests a large page (>=100, the backend's hard cap) we loop every page so
// callers that rely on "fetch all" (e.g. limit:1000) actually receive everything.
export async function listRequest<T>(
  path: string,
  params?: ListParams,
  opts?: ListFetchOpts,
): Promise<PaginatedResponse<T>> {
  const limit = Math.max(1, params?.limit ?? PAGE_SIZE)
  const page = Math.max(1, params?.page ?? 1)
  const url = buildQuery(path, params)

  const first = await apiRequest<ListEnvelope<T>>('GET', url, undefined, opts?.signal ? { signal: opts.signal } : undefined)
  if (!Array.isArray(first?.data)) throw unexpectedEnvelope(url)

  const shouldFetchAll = opts?.fetchAll ?? limit >= 100
  if (shouldFetchAll && first.meta && first.meta.total > first.data.length) {
    const rest = await fetchAllPages<T>(
      async (p) => {
        const res = await apiRequest<ListEnvelope<T>>(
          'GET',
          buildQuery(path, { ...params, page: p }),
          undefined,
          opts?.signal ? { signal: opts.signal } : undefined,
        )
        if (!Array.isArray(res?.data)) throw unexpectedEnvelope(url)
        return res
      },
      page + 1,
      opts,
    )
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
export async function arrayRequest<T>(method: string, path: string, body?: unknown, opts?: ListFetchOpts): Promise<T[]> {
  const res = await apiRequest<ItemEnvelope<T[]>>(method, path, body, opts?.signal ? { signal: opts.signal } : undefined)
  if (res === undefined || res === null || typeof res !== 'object' || !('data' in res)) {
    throw unexpectedEnvelope(path)
  }
  const data = res.data
  if (data === null || data === undefined) return [] // nil slice marshals to null
  if (!Array.isArray(data)) throw unexpectedEnvelope(path)
  return data.map(normalizeTenantId)
}

// GET/POST a list wrapped as `{ data: { items: [] } }` (reports, consent,
// participant-missions). Unwraps the nested `items` array and normalizes
// tenant_id. Tenant scoping is applied by apiRequest's built-in X-Tenant-Id
// injection (SUPER_ADMIN), so no header plumbing is needed here.
export async function itemsRequest<T>(method: string, path: string, body?: unknown, opts?: ListFetchOpts): Promise<T[]> {
  const res = await apiRequest<ItemsEnvelope<T>>(method, path, body, opts?.signal ? { signal: opts.signal } : undefined)
  if (res === undefined || res === null || typeof res !== 'object' || !('data' in res)) {
    throw unexpectedEnvelope(path)
  }
  const inner: unknown = res.data
  if (inner === null || inner === undefined) return [] // nil data marshals to null
  if (typeof inner !== 'object' || !('items' in inner)) throw unexpectedEnvelope(path)
  const items: unknown = inner.items
  if (items === null || items === undefined) return [] // nil slice marshals to null
  if (!Array.isArray(items)) throw unexpectedEnvelope(path)
  return items.map(normalizeTenantId)
}

// GET/POST a list wrapped as `{ data: { items: [], ...extras } }`, preserving
// sibling top-level fields (operation state such as active_batches/active_send).
// Malformed envelopes throw the same `unexpectedEnvelope` error as itemsRequest.
export async function itemsWithExtrasRequest<T, E extends Record<string, unknown> = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ items: T[]; extras: E }> {
  const res = await apiRequest<ItemsEnvelope<T>>(method, path, body)
  if (res === undefined || res === null || typeof res !== 'object' || !('data' in res)) {
    throw unexpectedEnvelope(path)
  }
  const inner: unknown = res.data
  if (inner === null || inner === undefined) return { items: [], extras: {} as E } // nil data marshals to null
  if (typeof inner !== 'object' || !('items' in inner)) throw unexpectedEnvelope(path)
  const record = inner as Record<string, unknown>
  const extras: Record<string, unknown> = {}
  for (const key of Object.keys(record)) {
    if (key !== 'items') extras[key] = record[key]
  }
  const items: unknown = record.items
  if (items === null || items === undefined) return { items: [], extras: extras as E } // nil slice marshals to null
  if (!Array.isArray(items)) throw unexpectedEnvelope(path)
  return { items: items.map(normalizeTenantId), extras: extras as E }
}

// GET/POST/PUT a single item; returns the unwrapped `data` (tenant_id normalized).
// `tenantId` overrides the global active-tenant flag (SUPER_ADMIN resource scoping).
export async function itemRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  tenantId?: string | null,
): Promise<T> {
  const res = await apiRequest<ItemEnvelope<T>>(method, path, body, {
    tenantId: tenantId ?? undefined,
  })
  // 204 (undefined body) is legitimate for mutations; any other body must be
  // an envelope — a `{}`/garbage body is a fault, not a missing record.
  if (res !== undefined && (typeof res !== 'object' || res === null || !('data' in res))) {
    throw unexpectedEnvelope(path)
  }
  return normalizeTenantId(res?.data)
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
  await apiRequest<unknown>(method, path, body)
}

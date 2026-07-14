import type { PaginatedResponse, ListParams, PhotoFrame } from '../types'
import type { FrameService } from './types'
import { apiRequest } from './backendClient'
import { withTenantHeader, normalizeTenantId, itemRequest } from './apiEnvelope'

// Frame service — backed by /api/frames (NOT /api/photo-frames) (C3).
// Replaces the IndexedDB barrel. Preserves the `frameService` export name and
// the FrameService signature. Backend list is paginated (max 100/page), so we
// loop pages (EC9) to return the full working set the callers expect.

interface FrameListEnvelope {
  data: { items: PhotoFrame[] }
  meta?: { page: number; limit: number; total: number }
}

const PAGE_SIZE = 100

const fetchAllPages = async (
  basePath: string,
  extra: Record<string, string>,
): Promise<PhotoFrame[]> => {
  const all: PhotoFrame[] = []
  let page = 1
  // Loop until we have everything (EC9). Guard with a sane upper bound.
  for (let safety = 0; safety < 1000; safety++) {
    const qs = new URLSearchParams()
    qs.set('page', String(page))
    qs.set('limit', String(PAGE_SIZE))
    for (const [k, v] of Object.entries(extra)) {
      if (v !== '' && v !== undefined) qs.set(k, v)
    }
    const res = await apiRequest<FrameListEnvelope>(
      'GET',
      `${basePath}?${qs.toString()}`,
      undefined,
      { headers: withTenantHeader() },
    )
    const items = (res.data?.items ?? []).map((f) => normalizeTenantId(f))
    all.push(...items)
    const meta = res.meta
    if (!meta || items.length === 0 || all.length >= meta.total) break
    if (items.length < PAGE_SIZE) break
    page += 1
  }
  return all
}

const getAll = async (
  params?: ListParams,
): Promise<PaginatedResponse<PhotoFrame>> => {
  // Honor the caller's requested page/limit in the envelope we return, but
  // fetch the full set via the pagination loop so filtering/search across the
  // whole tenant works as the IndexedDB version did.
  const extra: Record<string, string> = {}
  if (params?.search) extra.search = params.search
  if (params?.filters?.program_id)
    extra.program_id = String(params.filters.program_id)

  const all = await fetchAllPages('/api/frames', extra)

  const page = params?.page ?? 1
  const limit = params?.limit ?? 10
  const start = (page - 1) * limit
  const paged = all.slice(start, start + limit)
  return {
    data: paged,
    total: all.length,
    page,
    limit,
    totalPages: Math.ceil(all.length / limit),
  }
}

const getById = async (id: string): Promise<PhotoFrame | null> => {
  return itemRequest<PhotoFrame>('GET', `/api/frames/${id}`)
}

const create = async (
  data: Omit<PhotoFrame, 'id' | 'created_at'>,
): Promise<PhotoFrame> => {
  return itemRequest<PhotoFrame>('POST', '/api/frames', {
    tenant_id: data.tenant_id,
    program_id: data.program_id ?? '',
    name: data.name,
    file_url: data.file_url,
    thumbnail_url: data.thumbnail_url ?? '',
    is_active: data.is_active,
    sort_order: data.sort_order ?? 0,
  })
}

const update = async (
  id: string,
  data: Partial<Omit<PhotoFrame, 'id' | 'created_at'>>,
): Promise<PhotoFrame> => {
  const body: Record<string, unknown> = {}
  if (data.tenant_id !== undefined) body.tenant_id = data.tenant_id
  if (data.program_id !== undefined) body.program_id = data.program_id
  if (data.name !== undefined) body.name = data.name
  if (data.file_url !== undefined) body.file_url = data.file_url
  if (data.thumbnail_url !== undefined) body.thumbnail_url = data.thumbnail_url
  if (data.is_active !== undefined) body.is_active = data.is_active
  if (data.sort_order !== undefined) body.sort_order = data.sort_order
  return itemRequest<PhotoFrame>('PUT', `/api/frames/${id}`, body)
}

const deactivate = async (id: string): Promise<PhotoFrame> => {
  return itemRequest<PhotoFrame>('POST', `/api/frames/${id}/deactivate`)
}

export const frameService: FrameService = {
  getAll,
  getById,
  create,
  update,
  deactivate,
}

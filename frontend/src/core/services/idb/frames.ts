import type { PaginatedResponse, ListParams, PhotoFrame } from '../../types'
import type { FrameService } from '../types'
import { getAll, getById as getByIdIDB, put } from '../storage/idb'
import { AppError } from '../../utils/errors'
import { getTenantScope, requireTenantId } from '../tenantScope'

const STORE_NAME = 'photo_frames'

const getAll_ = async (params?: ListParams): Promise<PaginatedResponse<PhotoFrame>> => {
  await new Promise((r) => setTimeout(r, 200))
  let data = await getAll<PhotoFrame>(STORE_NAME)

  const scope = getTenantScope()
  if (scope.tenantId) {
    data = data.filter((f) => f.tenant_id === scope.tenantId)
  } else if (scope.blocked) {
    data = []
  }
  
  if (params?.filters?.program_id) {
    const programId = params.filters!.program_id as string
    data = data.filter((f) => !f.program_id || f.program_id === programId)
  }
  if (params?.search) {
    const q = params.search.toLowerCase()
    data = data.filter((f) => f.name.toLowerCase().includes(q))
  }
  
  const page = params?.page ?? 1
  const limit = params?.limit ?? 10
  const start = (page - 1) * limit
  return {
    data: data.slice(start, start + limit),
    total: data.length,
    page,
    limit,
    totalPages: Math.ceil(data.length / limit),
  }
}

const getById = async (id: string): Promise<PhotoFrame | null> => {
  await new Promise((r) => setTimeout(r, 100))
  return await getByIdIDB<PhotoFrame>(STORE_NAME, id)
}

const create = async (data: Omit<PhotoFrame, 'id' | 'created_at'>): Promise<PhotoFrame> => {
  await new Promise((r) => setTimeout(r, 300))
  const tenantId = requireTenantId(data.tenant_id)
  const frame: PhotoFrame = {
    id: `f-${Date.now()}`,
    ...data,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }
  await put(STORE_NAME, frame)
  return frame
}

const update = async (id: string, data: Partial<Omit<PhotoFrame, 'id' | 'created_at'>>): Promise<PhotoFrame> => {
  await new Promise((r) => setTimeout(r, 300))
  const existing = await getByIdIDB<PhotoFrame>(STORE_NAME, id)
  if (!existing) throw new AppError('NOT_FOUND', 'Frame not found')
  
  const updated = { ...existing, ...data }
  await put(STORE_NAME, updated)
  return updated
}

const deactivate = async (id: string): Promise<PhotoFrame> => {
  await new Promise((r) => setTimeout(r, 250))
  const existing = await getByIdIDB<PhotoFrame>(STORE_NAME, id)
  if (!existing) throw new AppError('NOT_FOUND', 'Frame not found')
  
  const updated = { ...existing, is_active: false }
  await put(STORE_NAME, updated)
  return updated
}

export const idbFrameService: FrameService = {
  getAll: getAll_,
  getById,
  create,
  update,
  deactivate,
}

import type { MissionBank, Program, CreateMissionBankDTO } from '../../types'
import type { MissionBankService } from '../types'
import { getAll, getById, put, deleteById } from '../storage/idb'
import { AppError } from '../../utils/errors'
import { getTenantScope, requireTenantId } from '../tenantScope'

const STORE_NAME = 'mission_banks'

const getAll_ = async (params?: {
  page?: number
  limit?: number
  search?: string
  filters?: Record<string, string | boolean | undefined>
}): Promise<{
  data: MissionBank[]
  total: number
  page: number
  limit: number
  totalPages: number
}> => {
  await new Promise((r) => setTimeout(r, 200))
  let data = await getAll<MissionBank>(STORE_NAME)

  const scope = getTenantScope()
  if (scope.tenantId || scope.blocked) {
    const programs = await getAll<Program>('programs')
    const validProgramIds = new Set(
      programs.filter((p) => p.tenant_id === scope.tenantId).map((p) => p.id)
    )
    data = data.filter((m) => validProgramIds.has(m.program_id))
  }
  
  if (params?.search) {
    const q = params.search.toLowerCase()
    data = data.filter(
      (m) =>
        m.title_child.toLowerCase().includes(q) ||
        m.title_parent.toLowerCase().includes(q)
    )
  }
  if (params?.filters?.program_id) {
    data = data.filter((m) => m.program_id === params.filters!.program_id)
  }
  if (params?.filters?.category) {
    data = data.filter((m) => m.category === params.filters!.category)
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

const create = async (data: CreateMissionBankDTO): Promise<MissionBank> => {
  await new Promise((r) => setTimeout(r, 300))
  const tenantId = requireTenantId()
  const program = await getById<Program>('programs', data.program_id)
  if (!program || program.tenant_id !== tenantId) {
    throw new Error('Program tidak ditemukan di tenant aktif')
  }
  const mission: MissionBank = {
    id: `m-${Date.now()}`,
    program_id: data.program_id,
    category: data.category,
    title_child: data.title_child,
    title_parent: data.title_parent,
    description_parent: data.description_parent,
    related_stage_ids: data.related_stage_ids,
    is_active: true,
    created_at: new Date().toISOString(),
  }
  await put(STORE_NAME, mission)
  return mission
}

const update = async (
  id: string,
  data: Partial<CreateMissionBankDTO>
): Promise<MissionBank> => {
  await new Promise((r) => setTimeout(r, 300))
  const existing = await getById<MissionBank>(STORE_NAME, id)
  if (!existing) throw new AppError('NOT_FOUND', 'Mission not found')
  
  const updated = { ...existing, ...data }
  await put(STORE_NAME, updated)
  return updated
}

const remove = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200))
  await deleteById(STORE_NAME, id)
}

const toggleActive = async (id: string): Promise<MissionBank> => {
  await new Promise((r) => setTimeout(r, 200))
  const item = await getById<MissionBank>(STORE_NAME, id)
  if (!item) throw new AppError('NOT_FOUND', 'Mission not found')
  
  item.is_active = !item.is_active
  await put(STORE_NAME, item)
  return item
}

const getById_ = async (id: string): Promise<MissionBank | null> => {
  await new Promise((r) => setTimeout(r, 100))
  return await getById<MissionBank>(STORE_NAME, id)
}

export const mockMissionService: MissionBankService = {
  getAll: getAll_,
  getById: getById_,
  create,
  update,
  delete: remove,
  toggleActive,
}

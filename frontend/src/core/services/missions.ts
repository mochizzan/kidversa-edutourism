import type { MissionBank, CreateMissionBankDTO } from '../types'
import type { MissionBankService } from './types'
import { apiRequest } from './backendClient'
import { withTenantHeader, normalizeTenantId } from './apiEnvelope'
import { useTenantStore } from '../stores/tenantStore'
import { STORAGE_KEYS } from '../constants/storage'
import { parseRawJSON } from '../utils/rawJson'

// MissionBank service — backed by /api/mission-banks (B7 for toggle-active).
// Replaces the IndexedDB barrel. Preserves the `missionService` export name and
// the MissionBankService signature.

// The active tenant drives the tenant-scoped writes. The backend derives the
// real tenant from the JWT; we still send it because the write DTOs require it.
function getActiveTenantId(): string | undefined {
  const { activeTenant } = useTenantStore.getState()
  if (activeTenant?.id) return activeTenant.id
  const tid =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEYS.ACTIVE_TENANT_ID)
      : null
  return tid ?? undefined
}

function normalizeMission(raw: MissionBank): MissionBank {
  return {
    ...raw,
    related_stage_ids: parseRawJSON<string[] | undefined>(
      (raw as Partial<MissionBank> & { related_stage_ids_json?: unknown })
        .related_stage_ids_json,
      raw.related_stage_ids,
    ),
  }
}

interface Envelope<T> {
  data: T
  meta?: { page: number; limit: number; total: number }
}

interface MissionBankListEnvelope {
  data: { items: MissionBank[] }
  meta?: { page: number; limit: number; total: number }
}

const getAll = async (
  params?: {
    page?: number
    limit?: number
    search?: string
    filters?: Record<string, string | boolean | undefined>
  },
): Promise<{
  data: MissionBank[]
  total: number
  page: number
  limit: number
  totalPages: number
}> => {
  const page = params?.page ?? 1
  const limit = params?.limit ?? 10

  const qs = new URLSearchParams()
  qs.set('page', String(page))
  qs.set('limit', String(limit))
  if (params?.search) qs.set('search', params.search)
  if (params?.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      if (value !== undefined && value !== null && value !== '') {
        qs.set(key, String(value))
      }
    }
  }

  const res = await apiRequest<MissionBankListEnvelope>(
    'GET',
    `/api/mission-banks?${qs.toString()}`,
    undefined,
    { headers: withTenantHeader() },
  )
  const items = (res.data?.items ?? []).map((m) => normalizeTenantId(normalizeMission(m)))
  const total = res.meta?.total ?? items.length
  return {
    data: items,
    total,
    page: res.meta?.page ?? page,
    limit: res.meta?.limit ?? limit,
    totalPages: Math.ceil(total / limit),
  }
}

const getById = async (id: string): Promise<MissionBank | null> => {
  const res = await apiRequest<Envelope<MissionBank>>(
    'GET',
    `/api/mission-banks/${id}`,
    undefined,
    { headers: withTenantHeader() },
  )
  return res.data ? normalizeMission(res.data) : null
}

const create = async (data: CreateMissionBankDTO): Promise<MissionBank> => {
  const body: Record<string, unknown> = {
    tenant_id: getActiveTenantId(),
    program_id: data.program_id,
    category: data.category,
    title_child: data.title_child,
    title_parent: data.title_parent,
    description_parent: data.description_parent ?? '',
    is_active: true,
  }
  if (data.related_stage_ids && data.related_stage_ids.length > 0) {
    body.related_stage_ids = data.related_stage_ids
  }
  const res = await apiRequest<Envelope<MissionBank>>(
    'POST',
    '/api/mission-banks',
    body,
    { headers: withTenantHeader() },
  )
  return normalizeMission(res.data)
}

const update = async (
  id: string,
  data: Partial<CreateMissionBankDTO>,
): Promise<MissionBank> => {
  const body: Record<string, unknown> = {}
  if (data.program_id !== undefined) body.program_id = data.program_id
  if (data.category !== undefined) body.category = data.category
  if (data.title_child !== undefined) body.title_child = data.title_child
  if (data.title_parent !== undefined) body.title_parent = data.title_parent
  if (data.description_parent !== undefined)
    body.description_parent = data.description_parent
  if (data.related_stage_ids !== undefined) {
    body.related_stage_ids = data.related_stage_ids
  }
  const res = await apiRequest<Envelope<MissionBank>>(
    'PUT',
    `/api/mission-banks/${id}`,
    body,
    { headers: withTenantHeader() },
  )
  return normalizeMission(res.data)
}

const remove = async (id: string): Promise<void> => {
  await apiRequest<void>('DELETE', `/api/mission-banks/${id}`, undefined, {
    headers: withTenantHeader(),
  })
}

const toggleActive = async (id: string): Promise<MissionBank> => {
  const res = await apiRequest<Envelope<MissionBank>>(
    'POST',
    `/api/mission-banks/${id}/toggle-active`,
    undefined,
    { headers: withTenantHeader() },
  )
  return normalizeMission(res.data)
}

export const missionService: MissionBankService = {
  getAll,
  getById,
  create,
  update,
  delete: remove,
  toggleActive,
}

// Participant missions are served by a separate shim (participantMissions.ts).
export { participantMissionService } from './participantMissions'

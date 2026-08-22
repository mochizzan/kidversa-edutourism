import type { MissionBank, CreateMissionBankDTO } from '../types'
import type { MissionBankService } from './types'
import { apiRequest } from './backendClient'
import {
  itemRequest,
  voidRequest,
  normalizeTenantId,
  type ItemsListEnvelope,
} from './apiEnvelope'
import { getActiveTenantId } from '../utils/tenant'
import { parseRawJSON } from '../utils/rawJson'
import { API_ROUTES } from '../constants/apiRoutes'

// MissionBank service — backed by /api/mission-banks (B7 for toggle-active).
// Replaces the IndexedDB barrel. Preserves the `missionService` export name and
// the MissionBankService signature.

// The active tenant drives the tenant-scoped writes. The backend derives the
// real tenant from the JWT; we still send it because the write DTOs require it.
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

// GET /api/mission-banks — list endpoint. The backend wraps the page as
// `{ data: { items: [] } }` (ItemsEnvelope). Reuses the shared itemsRequest
// unwrap + tenant_id normalization; the MissionBankService consumer expects the
// `{ data, total, page, limit, totalPages }` shape, so we flatten meta here.
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

  const res = await apiRequest<ItemsListEnvelope<MissionBank>>(
    'GET',
    `${API_ROUTES.MISSIONS.BASE}?${qs.toString()}`,
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
  return itemRequest<MissionBank>('GET', API_ROUTES.MISSIONS.DETAIL(id))
}

const create = async (data: CreateMissionBankDTO): Promise<MissionBank> => {
  return itemRequest<MissionBank>('POST', API_ROUTES.MISSIONS.BASE, {
    tenant_id: getActiveTenantId() ?? undefined,
    program_id: data.program_id,
    category: data.category,
    title_child: data.title_child,
    title_parent: data.title_parent,
    description_parent: data.description_parent ?? '',
    is_active: true,
    ...(data.related_stage_ids && data.related_stage_ids.length > 0
      ? { related_stage_ids: data.related_stage_ids }
      : {}),
  })
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
  return itemRequest<MissionBank>('PUT', API_ROUTES.MISSIONS.DETAIL(id), body)
}

const remove = async (id: string): Promise<void> => {
  await voidRequest('DELETE', API_ROUTES.MISSIONS.DETAIL(id))
}

const toggleActive = async (id: string): Promise<MissionBank> => {
  return itemRequest<MissionBank>('POST', API_ROUTES.MISSIONS.TOGGLE_ACTIVE(id))
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

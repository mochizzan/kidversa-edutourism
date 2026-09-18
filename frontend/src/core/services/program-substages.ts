// program-substages.ts — backend-backed Kegiatan (ProgramSubstage) service.
//
// Mirrors the backend /api/program-substages contract: paginated list, detail,
// list by stage, create/update/reorder/delete, and the per-leaf badge image
// upload. Uses the shared apiEnvelope helpers (tenant header + envelope unwrap)
// so auth/tenant scoping is identical to every other service.

import type { ProgramSubstage, PaginatedResponse } from '../types'
import { listRequest, itemRequest, voidRequest, arrayRequest, nullableItemRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

export interface GetSubstagesParams {
  programId?: string
  programStageId?: string
  search?: string
  page?: number
  limit?: number
}

export interface CreateProgramSubstageDTO {
  program_stage_id: string
  sequence_order: number
  name: string
  description?: string
}

export type UpdateProgramSubstageDTO = Partial<CreateProgramSubstageDTO>

export interface ProgramSubstageService {
  getAll(params?: GetSubstagesParams): Promise<PaginatedResponse<ProgramSubstage>>
  getById(id: string): Promise<ProgramSubstage | null>
  listByStage(programStageId: string): Promise<ProgramSubstage[]>
  create(data: CreateProgramSubstageDTO): Promise<ProgramSubstage>
  update(id: string, data: UpdateProgramSubstageDTO): Promise<ProgramSubstage>
  reorder(orderedIds: string[]): Promise<void>
  remove(id: string): Promise<void>
}

function sortSubstages(substages: ProgramSubstage[]): ProgramSubstage[] {
  return [...substages].sort((a, b) => a.sequence_order - b.sequence_order)
}

function buildProgramSubstagesPath(params?: GetSubstagesParams): string {
  const query = new URLSearchParams()
  if (params?.programId) query.set('program_id', params.programId)
  if (params?.programStageId) query.set('program_stage_id', params.programStageId)
  if (params?.search) query.set('search', params.search)
  if (params?.page !== undefined) query.set('page', String(params.page))
  if (params?.limit !== undefined) query.set('limit', String(params.limit))
  const qs = query.toString()
  return qs ? `/api/program-substages?${qs}` : '/api/program-substages'
}

export const programSubstageService: ProgramSubstageService = {
  getAll: (params) =>
    listRequest<ProgramSubstage>(buildProgramSubstagesPath(params), {
      page: params?.page,
      limit: params?.limit,
      search: params?.search,
    }),

  getById: (id) => nullableItemRequest<ProgramSubstage>('GET', API_ROUTES.PROGRAM_SUBSTAGES.DETAIL(id)),

  listByStage: (programStageId) =>
    arrayRequest<ProgramSubstage>('GET', API_ROUTES.PROGRAM_SUBSTAGES.BY_STAGE(programStageId)).then(
      sortSubstages,
    ),

  create: (data) =>
    itemRequest<ProgramSubstage>('POST', API_ROUTES.PROGRAM_SUBSTAGES.BASE, {
      program_stage_id: data.program_stage_id,
      sequence_order: data.sequence_order,
      name: data.name,
      description: data.description ?? '',
    }),

  update: (id, data) => {
    const body: Record<string, unknown> = {}
    if (data.program_stage_id !== undefined) body.program_stage_id = data.program_stage_id
    if (data.sequence_order !== undefined) body.sequence_order = data.sequence_order
    if (data.name !== undefined) body.name = data.name
    if (data.description !== undefined) body.description = data.description
    return itemRequest<ProgramSubstage>('PUT', API_ROUTES.PROGRAM_SUBSTAGES.DETAIL(id), body)
  },

  reorder: (orderedIds) => voidRequest('POST', API_ROUTES.PROGRAM_SUBSTAGES.REORDER, { ordered_ids: orderedIds }),

  remove: (id) => voidRequest('DELETE', API_ROUTES.PROGRAM_SUBSTAGES.DETAIL(id)),
}

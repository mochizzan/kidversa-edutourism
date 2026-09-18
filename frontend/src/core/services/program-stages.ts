// program-stages.ts — standalone backend-backed ProgramStage (Topik) service.
//
// Mirrors the backend /api/program-stages contract where it exists
// (GET /api/program-stages paginated list). Detail/mutation endpoints are not
// exposed standalone, so create/update/delete/getById fall back to the nested
// /api/programs/:programId/stages routes.
// Uses the shared apiEnvelope helpers (tenant header + envelope unwrap) so
// auth/tenant scoping is identical to every other service.

import type { ProgramStage, PaginatedResponse } from '../types'
import { listRequest, itemRequest, voidRequest, arrayRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'
import { programService } from './programs'

export interface GetStagesParams {
  programId?: string
  search?: string
  page?: number
  limit?: number
}

export interface CreateProgramStageDTO {
  program_id: string
  sequence_order: number
  name: string
  description?: string
  content_type: string
  is_photo_stage?: boolean
}

export type UpdateProgramStageDTO = Partial<CreateProgramStageDTO>

export interface ProgramStageService {
  getAll(params?: GetStagesParams): Promise<PaginatedResponse<ProgramStage>>
  getById(id: string): Promise<ProgramStage | null>
  create(data: CreateProgramStageDTO): Promise<ProgramStage>
  update(id: string, data: UpdateProgramStageDTO): Promise<ProgramStage>
  delete(id: string): Promise<void>
  getStages(programId: string): Promise<ProgramStage[]>
}

function sortStages(stages: ProgramStage[]): ProgramStage[] {
  return [...stages].sort((a, b) => a.sequence_order - b.sequence_order)
}

// The backend exposes only GET /api/program-stages. Build the path inline so
// we do not depend on a route namespace another agent owns.
function buildProgramStagesPath(params?: GetStagesParams): string {
  const query = new URLSearchParams()
  if (params?.programId) query.set('program_id', params.programId)
  if (params?.search) query.set('search', params.search)
  if (params?.page !== undefined) query.set('page', String(params.page))
  if (params?.limit !== undefined) query.set('limit', String(params.limit))
  const qs = query.toString()
  return qs ? `/api/program-stages?${qs}` : '/api/program-stages'
}

// Resolve program_id for a stage id by scanning all programs. The backend does
// not expose GET /api/program-stages/:id, so this fallback is required for
// update/delete routing.
async function resolveProgramId(stageId: string): Promise<string | null> {
  const res = await programService.getAll({ limit: 1000 })
  for (const program of res.data) {
    const stages = await programService.getStages(program.id)
    if (stages.some((s) => s.id === stageId)) {
      return program.id
    }
  }
  return null
}

export const programStageService: ProgramStageService = {
  getAll: (params) => listRequest<ProgramStage>(buildProgramStagesPath(params)),

  getById: async (id) => {
    const programId = await resolveProgramId(id)
    if (!programId) return null
    const stage = await itemRequest<ProgramStage>(
      'GET',
      API_ROUTES.PROGRAMS.STAGE_DETAIL(programId, id),
    )
    return stage
  },

  create: (data) =>
    itemRequest<ProgramStage>('POST', API_ROUTES.PROGRAMS.STAGES(data.program_id), {
      sequence_order: data.sequence_order,
      name: data.name,
      description: data.description,
      content_type: data.content_type,
      is_photo_stage: data.is_photo_stage,
    }),

  update: async (id, data) => {
    const programId = data.program_id ?? (await resolveProgramId(id))
    if (!programId) {
      throw new Error('stage_not_found')
    }
    const body: Record<string, unknown> = {}
    if (data.sequence_order !== undefined) body.sequence_order = data.sequence_order
    if (data.name !== undefined) body.name = data.name
    if (data.description !== undefined) body.description = data.description
    if (data.content_type !== undefined) body.content_type = data.content_type
    if (data.is_photo_stage !== undefined) body.is_photo_stage = data.is_photo_stage
    return itemRequest<ProgramStage>('PUT', API_ROUTES.PROGRAMS.STAGE_DETAIL(programId, id), body)
  },

  delete: async (id) => {
    const programId = await resolveProgramId(id)
    if (!programId) {
      throw new Error('stage_not_found')
    }
    await voidRequest('DELETE', API_ROUTES.PROGRAMS.STAGE_DETAIL(programId, id))
  },

  getStages: (programId) =>
    arrayRequest<ProgramStage>('GET', API_ROUTES.PROGRAMS.STAGES(programId)).then(sortStages),
}

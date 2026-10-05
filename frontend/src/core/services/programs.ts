import type { ProgramService } from './types'
import type {
  Program,
  ProgramStage,
  StageContent,
  CreateProgramDTO,
  UpdateProgramDTO,
  CreateStageDTO,
  UpdateStageDTO,
  ToggleActiveResult,
} from '../types'
import { listRequest, itemRequest, voidRequest, arrayRequest, nullableItemRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

// Program stages are ordered by sequence_order. The list endpoint returns them
// unsorted; sort defensively so hydration matches the idb behaviour.
function sortStages(stages: ProgramStage[]): ProgramStage[] {
  return [...stages].sort((a, b) => a.sequence_order - b.sequence_order)
}

export const programService: ProgramService = {
  getAll: (params) =>
    listRequest<Program & { stages?: ProgramStage[] }>(API_ROUTES.PROGRAMS.BASE, params),

  getById: async (id) => {
    const program = await nullableItemRequest<Program & { stages?: ProgramStage[] }>(
      'GET',
      API_ROUTES.PROGRAMS.DETAIL(id),
    )
    if (!program) return null
    // Hydrate nested stages (the plan requires stages hydrated with pagination-loop).
    let stages = program.stages
    if (!stages) {
      stages = sortStages(await arrayRequest<ProgramStage>('GET', API_ROUTES.PROGRAMS.STAGES(id)))
    } else {
      stages = sortStages(stages)
    }
    return { ...program, stages }
  },

  create: (data: CreateProgramDTO) =>
    itemRequest<Program>('POST', API_ROUTES.PROGRAMS.BASE, {
      name: data.name,
      description: data.description,
      final_badge_name: data.final_badge_name,
      final_badge_image_url: data.final_badge_image_url,
    }),

  update: (id, data: UpdateProgramDTO) =>
    itemRequest<Program>('PUT', API_ROUTES.PROGRAMS.DETAIL(id), {
      name: data.name,
      description: data.description,
      is_active: data.is_active,
      final_badge_name: data.final_badge_name,
      final_badge_image_url: data.final_badge_image_url,
    }),

  toggleActive: (id) =>
    itemRequest<ToggleActiveResult>('POST', API_ROUTES.PROGRAMS.TOGGLE_ACTIVE(id)),

  delete: (id, options) =>
    voidRequest('DELETE', API_ROUTES.PROGRAMS.DETAIL(id) + (options?.force ? '?force=true' : '')),

  getStages: (programId) =>
    arrayRequest<ProgramStage>('GET', API_ROUTES.PROGRAMS.STAGES(programId)).then(sortStages),

  createStage: (programId, data: CreateStageDTO) =>
    itemRequest<ProgramStage>('POST', API_ROUTES.PROGRAMS.STAGES(programId), {
      sequence_order: data.sequence_order,
      name: data.name,
      description: data.description,
      content_type: data.content_type,
    }),

  updateStage: (programId, stageId, data: UpdateStageDTO) =>
    itemRequest<ProgramStage>('PUT', API_ROUTES.PROGRAMS.STAGE_DETAIL(programId, stageId), {
      sequence_order: data.sequence_order,
      name: data.name,
      description: data.description,
      content_type: data.content_type,
      badge_name: data.badge_name,
      badge_image_url: data.badge_image_url,
    }),

  deleteStage: (programId, stageId) =>
    voidRequest('DELETE', API_ROUTES.PROGRAMS.STAGE_DETAIL(programId, stageId)),

  getContents: (substageId) =>
    arrayRequest<StageContent>('GET', API_ROUTES.PROGRAMS.CONTENTS(substageId)),
}

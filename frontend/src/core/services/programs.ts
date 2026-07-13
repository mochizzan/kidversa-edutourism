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
import { listRequest, itemRequest, voidRequest, arrayRequest } from './apiEnvelope'

// Program stages are ordered by sequence_order. The list endpoint returns them
// unsorted; sort defensively so hydration matches the idb behaviour.
function sortStages(stages: ProgramStage[]): ProgramStage[] {
  return [...stages].sort((a, b) => a.sequence_order - b.sequence_order)
}

export const programService: ProgramService = {
  getAll: (params) => listRequest<Program & { stages?: ProgramStage[] }>('/api/programs', params),

  getById: async (id) => {
    try {
      const program = await itemRequest<Program & { stages?: ProgramStage[] }>(
        'GET',
        `/api/programs/${id}`,
      )
      // Hydrate nested stages (the plan requires stages hydrated with pagination-loop).
      let stages = program.stages
      if (!stages) {
        stages = sortStages(await arrayRequest<ProgramStage>('GET', `/api/programs/${id}/stages`))
      } else {
        stages = sortStages(stages)
      }
      return { ...program, stages }
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        return null
      }
      throw err
    }
  },

  create: (data: CreateProgramDTO) =>
    itemRequest<Program>('POST', '/api/programs', {
      name: data.name,
      description: data.description,
      thumbnail_url: data.thumbnail_url,
    }),

  update: (id, data: UpdateProgramDTO) =>
    itemRequest<Program>('PUT', `/api/programs/${id}`, {
      name: data.name,
      description: data.description,
      thumbnail_url: data.thumbnail_url,
      is_active: data.is_active,
    }),

  toggleActive: (id) =>
    itemRequest<ToggleActiveResult>('POST', `/api/programs/${id}/toggle-active`),

  delete: (id) => voidRequest('DELETE', `/api/programs/${id}`),

  getStages: (programId) =>
    arrayRequest<ProgramStage>('GET', `/api/programs/${programId}/stages`).then(sortStages),

  createStage: (programId, data: CreateStageDTO) =>
    itemRequest<ProgramStage>('POST', `/api/programs/${programId}/stages`, {
      sequence_order: data.sequence_order,
      name: data.name,
      description: data.description,
      content_type: data.content_type,
      duration_minutes: data.duration_minutes,
      is_recording_stage: data.is_recording_stage,
      is_photo_stage: data.is_photo_stage,
    }),

  updateStage: (programId, stageId, data: UpdateStageDTO) =>
    itemRequest<ProgramStage>('PUT', `/api/programs/${programId}/stages/${stageId}`, {
      sequence_order: data.sequence_order,
      name: data.name,
      description: data.description,
      content_type: data.content_type,
      duration_minutes: data.duration_minutes,
      is_recording_stage: data.is_recording_stage,
      is_photo_stage: data.is_photo_stage,
    }),

  deleteStage: (programId, stageId) =>
    voidRequest('DELETE', `/api/programs/${programId}/stages/${stageId}`),

  reorderStages: (programId, stageIds) =>
    voidRequest('POST', `/api/programs/${programId}/stages/reorder`, { ordered_ids: stageIds }),

  getContents: (stageId) =>
    arrayRequest<StageContent>('GET', `/api/programs/program-stages/${stageId}/contents`),

  createContent: (stageId, data) =>
    itemRequest<StageContent>('POST', `/api/programs/program-stages/${stageId}/contents`, {
      title: data.title,
      file_url: data.file_url,
      file_type: data.file_type,
      duration_seconds: data.duration_seconds,
      sort_order: data.sort_order,
      is_active: data.is_active,
    }),

  updateContent: (stageId, contentId, data) =>
    itemRequest<StageContent>('PUT', `/api/programs/program-stages/${stageId}/contents/${contentId}`, {
      title: data.title,
      file_url: data.file_url,
      file_type: data.file_type,
      duration_seconds: data.duration_seconds,
      sort_order: data.sort_order,
      is_active: data.is_active,
    }),

  deleteContent: (stageId, contentId) =>
    voidRequest('DELETE', `/api/programs/program-stages/${stageId}/contents/${contentId}`),

  reorderContents: (stageId, contentIds) =>
    voidRequest('POST', `/api/programs/program-stages/${stageId}/contents/reorder`, {
      ordered_ids: contentIds,
    }),
}

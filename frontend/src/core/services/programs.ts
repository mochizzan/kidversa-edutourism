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
import { uploadMultipart } from './uploadMultipart'
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
    try {
      const program = await itemRequest<Program & { stages?: ProgramStage[] }>(
        'GET',
        API_ROUTES.PROGRAMS.DETAIL(id),
      )
      // Hydrate nested stages (the plan requires stages hydrated with pagination-loop).
      let stages = program.stages
      if (!stages) {
        stages = sortStages(await arrayRequest<ProgramStage>('GET', API_ROUTES.PROGRAMS.STAGES(id)))
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
    itemRequest<Program>('POST', API_ROUTES.PROGRAMS.BASE, {
      name: data.name,
      description: data.description,
      thumbnail_url: data.thumbnail_url,
    }),

  update: (id, data: UpdateProgramDTO) =>
    itemRequest<Program>('PUT', API_ROUTES.PROGRAMS.DETAIL(id), {
      name: data.name,
      description: data.description,
      thumbnail_url: data.thumbnail_url,
      is_active: data.is_active,
    }),

  toggleActive: (id) =>
    itemRequest<ToggleActiveResult>('POST', API_ROUTES.PROGRAMS.TOGGLE_ACTIVE(id)),

  delete: (id) => voidRequest('DELETE', API_ROUTES.PROGRAMS.DETAIL(id)),

  getStages: (programId) =>
    arrayRequest<ProgramStage>('GET', API_ROUTES.PROGRAMS.STAGES(programId)).then(sortStages),

  createStage: (programId, data: CreateStageDTO) =>
    itemRequest<ProgramStage>('POST', API_ROUTES.PROGRAMS.STAGES(programId), {
      sequence_order: data.sequence_order,
      name: data.name,
      description: data.description,
      content_type: data.content_type,
      duration_minutes: data.duration_minutes,
      is_recording_stage: data.is_recording_stage,
      is_photo_stage: data.is_photo_stage,
    }),

  updateStage: (programId, stageId, data: UpdateStageDTO) =>
    itemRequest<ProgramStage>('PUT', API_ROUTES.PROGRAMS.STAGE_DETAIL(programId, stageId), {
      sequence_order: data.sequence_order,
      name: data.name,
      description: data.description,
      content_type: data.content_type,
      duration_minutes: data.duration_minutes,
      is_recording_stage: data.is_recording_stage,
      is_photo_stage: data.is_photo_stage,
    }),

  deleteStage: (programId, stageId) =>
    voidRequest('DELETE', API_ROUTES.PROGRAMS.STAGE_DETAIL(programId, stageId)),

  reorderStages: (programId, stageIds) =>
    voidRequest('POST', API_ROUTES.PROGRAMS.REORDER_STAGES(programId), { ordered_ids: stageIds }),

  getContents: (stageId) =>
    arrayRequest<StageContent>('GET', API_ROUTES.PROGRAMS.CONTENTS(stageId)),

  createContent: (stageId, data) =>
    itemRequest<StageContent>('POST', API_ROUTES.PROGRAMS.CONTENTS(stageId), {
      title: data.title,
      file_url: data.file_url,
      youtube_url: data.youtube_url,
      file_type: data.file_type,
      duration_seconds: data.duration_seconds,
      sort_order: data.sort_order,
      is_active: data.is_active,
    }),

  uploadContent: (stageId, data) => {
    const form = new FormData()
    form.append('file', data.file)
    form.append('title', data.title)
    form.append('file_type', data.file_type)
    if (data.duration_seconds !== undefined) {
      form.append('duration_seconds', String(data.duration_seconds))
    }
    if (data.youtube_url !== undefined && data.youtube_url !== '') {
      form.append('youtube_url', data.youtube_url)
    }
    return uploadMultipart<StageContent>(
      API_ROUTES.PROGRAM_STAGES.CONTENTS_UPLOAD(stageId),
      form,
    )
  },

  updateContent: (stageId, contentId, data) =>
    itemRequest<StageContent>('PUT', API_ROUTES.PROGRAMS.CONTENT_DETAIL(stageId, contentId), {
      title: data.title,
      file_url: data.file_url,
      youtube_url: data.youtube_url,
      file_type: data.file_type,
      duration_seconds: data.duration_seconds,
      sort_order: data.sort_order,
      is_active: data.is_active,
    }),

  deleteContent: (stageId, contentId) =>
    voidRequest('DELETE', API_ROUTES.PROGRAMS.CONTENT_DETAIL(stageId, contentId)),

  reorderContents: (stageId, contentIds) =>
    voidRequest('POST', API_ROUTES.PROGRAMS.REORDER_CONTENTS(stageId), {
      ordered_ids: contentIds,
    }),
}

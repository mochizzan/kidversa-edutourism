import type { Program, ProgramStage, StageContent } from '../../types'
import type { ProgramService } from '../types'
import { getAll, getById, put, queryByIndex, deleteById } from '../storage/idb'
import { AppError } from '../../utils/errors'
import { getTenantScope, requireTenantId } from '../tenantScope'

const PROGRAMS_STORE = 'programs'
const STAGES_STORE = 'program_stages'
const CONTENTS_STORE = 'stage_contents'

const getAll_ = async (params?: { page?: number; limit?: number; search?: string }): Promise<{
  data: (Program & { stages?: ProgramStage[] })[]
  total: number
  page: number
  limit: number
  totalPages: number
}> => {
  await new Promise((r) => setTimeout(r, 200))
  let data = await getAll<Program>(PROGRAMS_STORE)

  const scope = getTenantScope()
  if (!scope.isSuperAdmin && scope.tenantId) {
    data = data.filter((p) => p.tenant_id === scope.tenantId)
  } else if (scope.isSuperAdmin && scope.tenantId) {
    data = data.filter((p) => p.tenant_id === scope.tenantId)
  } else if (scope.isSuperAdmin && !scope.tenantId) {
    data = []
  }
  
  if (params?.search) {
    const q = params.search.toLowerCase()
    data = data.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
  }
  
  const page = params?.page ?? 1
  const limit = params?.limit ?? 10
  const start = (page - 1) * limit
  const paginated = data.slice(start, start + limit)
  
  // Hydrate stages for paginated programs
  const withStages = await Promise.all(
    paginated.map(async (p) => {
      const stages = await queryByIndex<ProgramStage>(STAGES_STORE, 'program_id', p.id)
      return { ...p, stages: stages.sort((a, b) => a.sequence_order - b.sequence_order) }
    })
  )
  
  return {
    data: withStages,
    total: data.length,
    page,
    limit,
    totalPages: Math.ceil(data.length / limit),
  }
}

const getById_ = async (id: string): Promise<(Program & { stages?: ProgramStage[] }) | null> => {
  await new Promise((r) => setTimeout(r, 100))
  const program = await getById<Program>(PROGRAMS_STORE, id)
  if (!program) return null
  
  // Hydrate stages from IDB
  const stages = await queryByIndex<ProgramStage>(STAGES_STORE, 'program_id', id)
  return {
    ...program,
    stages: stages.sort((a, b) => a.sequence_order - b.sequence_order),
  }
}

const create = async (data: {
  name: string
  description?: string
  thumbnail_url?: string
  tenant_id?: string
}): Promise<Program> => {
  await new Promise((r) => setTimeout(r, 300))
  const tenantId = requireTenantId(data.tenant_id)
  const program: Program = {
    id: `p-${Date.now()}`,
    tenant_id: tenantId,
    name: data.name,
    description: data.description,
    thumbnail_url: data.thumbnail_url,
    is_active: true,
    created_at: new Date().toISOString(),
  }
  await put(PROGRAMS_STORE, program)
  return program
}

const update = async (id: string, data: {
  name?: string
  description?: string
  thumbnail_url?: string
  is_active?: boolean
}): Promise<Program> => {
  await new Promise((r) => setTimeout(r, 300))
  const existing = await getById<Program>(PROGRAMS_STORE, id)
  if (!existing) throw new AppError('NOT_FOUND', 'Program not found')
  
  const updated = { ...existing, ...data }
  await put(PROGRAMS_STORE, updated)
  return updated
}

const toggleActive = async (id: string): Promise<Program> => {
  await new Promise((r) => setTimeout(r, 250))
  const item = await getById<Program>(PROGRAMS_STORE, id)
  if (!item) throw new AppError('NOT_FOUND', 'Program not found')
  return update(id, { is_active: !item.is_active })
}

const remove = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 250))
  await deleteById(PROGRAMS_STORE, id)
}

const getStages = async (programId: string): Promise<ProgramStage[]> => {
  await new Promise((r) => setTimeout(r, 150))
  const stages = await queryByIndex<ProgramStage>(STAGES_STORE, 'program_id', programId)
  return stages.sort((a, b) => a.sequence_order - b.sequence_order)
}

const createStage = async (
  programId: string,
  data: {
    sequence_order: number
    name: string
    description?: string
    content_type: string
    duration_minutes: number
    is_recording_stage?: boolean
    is_photo_stage?: boolean
  }
): Promise<ProgramStage> => {
  await new Promise((r) => setTimeout(r, 250))
  
  // Verify program exists
  const program = await getById<Program>(PROGRAMS_STORE, programId)
  if (!program) throw new AppError('NOT_FOUND', 'Program not found')
  
  const stage: ProgramStage = {
    id: `ps-${Date.now()}`,
    program_id: programId,
    sequence_order: data.sequence_order,
    name: data.name,
    description: data.description,
    content_type: data.content_type as ProgramStage['content_type'],
    duration_minutes: data.duration_minutes,
    is_recording_stage: data.is_recording_stage ?? false,
    is_photo_stage: data.is_photo_stage ?? true,
    created_at: new Date().toISOString(),
  }
  await put(STAGES_STORE, stage)
  return stage
}

const updateStage = async (
  programId: string,
  stageId: string,
  data: {
    sequence_order?: number
    name?: string
    description?: string
    content_type?: string
    duration_minutes?: number
    is_recording_stage?: boolean
    is_photo_stage?: boolean
  }
): Promise<ProgramStage> => {
  await new Promise((r) => setTimeout(r, 250))
  const existing = await getById<ProgramStage>(STAGES_STORE, stageId)
  if (!existing || existing.program_id !== programId) throw new AppError('NOT_FOUND', 'Stage not found')
  
  const updated = {
    ...existing,
    ...data,
    content_type: (data.content_type ?? existing.content_type) as ProgramStage['content_type'],
  }
  await put(STAGES_STORE, updated)
  return updated
}

const deleteStage = async (programId: string, stageId: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 250))
  const existing = await getById<ProgramStage>(STAGES_STORE, stageId)
  if (existing && existing.program_id === programId) {
    // Cascade delete orphaned stage contents
    const orphan = await queryByIndex<StageContent>(CONTENTS_STORE, 'program_stage_id', stageId)
    await Promise.all(orphan.map((c) => deleteById(CONTENTS_STORE, c.id)))
    await deleteById(STAGES_STORE, stageId)
  }
}

const reorderStages = async (programId: string, stageIds: string[]): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200))
  const stages = await queryByIndex<ProgramStage>(STAGES_STORE, 'program_id', programId)
  const stageMap = new Map(stages.map((s) => [s.id, s]))
  
  for (let i = 0; i < stageIds.length; i++) {
    const stage = stageMap.get(stageIds[i])
    if (stage) {
      stage.sequence_order = i + 1
      await put(STAGES_STORE, stage)
    }
  }
}

const getContents = async (stageId: string): Promise<StageContent[]> => {
  await new Promise((r) => setTimeout(r, 150))
  const contents = await queryByIndex<StageContent>(CONTENTS_STORE, 'program_stage_id', stageId)
  return contents.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

const createContent = async (
  stageId: string,
  data: Omit<StageContent, 'id' | 'program_stage_id' | 'created_at'>
): Promise<StageContent> => {
  await new Promise((r) => setTimeout(r, 250))
  const content: StageContent = {
    id: `sc-${Date.now()}`,
    program_stage_id: stageId,
    ...data,
    created_at: new Date().toISOString(),
  } as StageContent
  await put(CONTENTS_STORE, content)
  return content
}

const updateContent = async (
  stageId: string,
  contentId: string,
  data: Partial<Omit<StageContent, 'id' | 'program_stage_id' | 'created_at'>>
): Promise<StageContent> => {
  await new Promise((r) => setTimeout(r, 250))
  const existing = await getById<StageContent>(CONTENTS_STORE, contentId)
  if (!existing || existing.program_stage_id !== stageId) throw new AppError('NOT_FOUND', 'Content not found')
  
  const updated = { ...existing, ...data }
  await put(CONTENTS_STORE, updated)
  return updated
}

const deleteContent = async (stageId: string, contentId: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 250))
  const existing = await getById<StageContent>(CONTENTS_STORE, contentId)
  if (existing && existing.program_stage_id === stageId) {
    await deleteById(CONTENTS_STORE, contentId)
  }
}

const reorderContents = async (stageId: string, contentIds: string[]): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200))
  const contents = await queryByIndex<StageContent>(CONTENTS_STORE, 'program_stage_id', stageId)
  const contentMap = new Map(contents.map((c) => [c.id, c]))
  
  for (let i = 0; i < contentIds.length; i++) {
    const content = contentMap.get(contentIds[i])
    if (content) {
      content.sort_order = i + 1
      await put(CONTENTS_STORE, content)
    }
  }
}

export const mockProgramService: ProgramService = {
  getAll: getAll_,
  getById: getById_,
  create,
  update,
  toggleActive,
  delete: remove,
  getStages,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  getContents,
  createContent,
  updateContent,
  deleteContent,
  reorderContents,
}

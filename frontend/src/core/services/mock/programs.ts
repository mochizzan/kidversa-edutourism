import type { Program, ProgramStage, StageContent } from '../../types'
import type { ProgramService } from '../types'
import { seedPrograms, seedProgramStages, seedStageContents } from './data/seed'
import { mockStorage } from './db'

const STORAGE_KEY = 'programs_v1'

type ProgramWithRelations = Program & {
  stages?: ProgramStage[]
  contents?: StageContent[]
}

const init = (): ProgramWithRelations[] => {
  const existing = mockStorage.get<ProgramWithRelations[]>(STORAGE_KEY, [])
  if (existing.length) return existing
  const data: ProgramWithRelations[] = seedPrograms.map((p) => ({
    ...p,
    stages: seedProgramStages
      .filter((s) => s.program_id === p.id)
      .sort((a: ProgramStage, b: ProgramStage) => a.sequence_order - b.sequence_order),
    contents: [],
  }))
  mockStorage.set(STORAGE_KEY, data)
  return data
}

const getAll = async (params?: { page?: number; limit?: number; search?: string }): Promise<{
  data: ProgramWithRelations[]
  total: number
  page: number
  limit: number
  totalPages: number
}> => {
  await new Promise((r) => setTimeout(r, 200))
  const data = init()
  let filtered = data
  if (params?.search) {
    const q = params.search.toLowerCase()
    filtered = data.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
  }
  const page = params?.page ?? 1
  const limit = params?.limit ?? 10
  const start = (page - 1) * limit
  const paginated = filtered.slice(start, start + limit)
  const stages = init().flatMap((p) => p.stages ?? [])
  return {
    data: paginated.map((p) => ({ ...p, stages: stages.filter((s) => s.program_id === p.id) })),
    total: filtered.length,
    page,
    limit,
    totalPages: Math.ceil(filtered.length / limit),
  }
}

const getById = async (id: string): Promise<ProgramWithRelations | null> => {
  await new Promise((r) => setTimeout(r, 100))
  return init().find((p) => p.id === id) ?? null
}

const create = async (data: {
  name: string
  description?: string
  thumbnail_url?: string
  tenant_id?: string
}): Promise<Program> => {
  await new Promise((r) => setTimeout(r, 300))
  const all = init()
  const program: Program = {
    id: `p-${Date.now()}`,
    tenant_id: data.tenant_id ?? 't-1',
    name: data.name,
    description: data.description,
    thumbnail_url: data.thumbnail_url,
    is_active: true,
    created_at: new Date().toISOString(),
  }
  all.push({ ...program, stages: [], contents: [] })
  mockStorage.set(STORAGE_KEY, all)
  return program
}

const update = async (id: string, data: {
  name?: string
  description?: string
  thumbnail_url?: string
  is_active?: boolean
}): Promise<Program> => {
  await new Promise((r) => setTimeout(r, 300))
  const all = init()
  const idx = all.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error('Program not found')
  const updated = { ...all[idx], ...data }
  all[idx] = updated
  mockStorage.set(STORAGE_KEY, all)
  return updated
}

const toggleActive = async (id: string): Promise<Program> => {
  await new Promise((r) => setTimeout(r, 250))
  const all = init()
  const item = all.find((p) => p.id === id)
  if (!item) throw new Error('Program not found')
  return update(id, { is_active: !item.is_active })
}

const remove = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 250))
  const all = init().filter((p) => p.id !== id)
  mockStorage.set(STORAGE_KEY, all)
}

const getStages = async (programId: string): Promise<ProgramStage[]> => {
  await new Promise((r) => setTimeout(r, 150))
  return init()
    .find((p) => p.id === programId)
    ?.stages?.sort((a, b) => a.sequence_order - b.sequence_order) ?? []
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
  const all = init()
  const program = all.find((p) => p.id === programId)
  if (!program) throw new Error('Program not found')
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
  program.stages = program.stages ? [...program.stages, stage] : [stage]
  mockStorage.set(STORAGE_KEY, all)
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
  const all = init()
  const program = all.find((p) => p.id === programId)
  if (!program?.stages) throw new Error('Program not found')
  const idx = program.stages.findIndex((s) => s.id === stageId)
  if (idx === -1) throw new Error('Stage not found')
  program.stages[idx] = { ...program.stages[idx], ...data, content_type: (data.content_type ?? program.stages[idx].content_type) as ProgramStage['content_type'] } as ProgramStage
  mockStorage.set(STORAGE_KEY, all)
  return program.stages[idx]
}

const deleteStage = async (programId: string, stageId: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 250))
  const all = init()
  const program = all.find((p) => p.id === programId)
  if (!program?.stages) return
  program.stages = program.stages.filter((s) => s.id !== stageId)
  mockStorage.set(STORAGE_KEY, all)
}

const reorderStages = async (programId: string, stageIds: string[]): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200))
  const all = init()
  const program = all.find((p) => p.id === programId)
  if (!program?.stages) return
  const map = new Map(program.stages.map((s) => [s.id, s]))
  program.stages = stageIds
    .map((id, index) => {
      const stage = map.get(id)
      if (!stage) return null
      return { ...stage, sequence_order: index + 1 }
    })
    .filter(Boolean) as ProgramStage[]
  mockStorage.set(STORAGE_KEY, all)
}

const getContents = async (stageId: string): Promise<StageContent[]> => {
  await new Promise((r) => setTimeout(r, 150))
  return seedStageContents.filter((c) => c.program_stage_id === stageId)
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
  seedStageContents.push(content)
  return content
}

const updateContent = async (
  stageId: string,
  contentId: string,
  data: Partial<Omit<StageContent, 'id' | 'program_stage_id' | 'created_at'>>
): Promise<StageContent> => {
  await new Promise((r) => setTimeout(r, 250))
  const content = seedStageContents.find((c) => c.id === contentId && c.program_stage_id === stageId)
  if (!content) throw new Error('Content not found')
  Object.assign(content, data)
  return content
}

const deleteContent = async (stageId: string, contentId: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 250))
  const idx = seedStageContents.findIndex((c) => c.id === contentId && c.program_stage_id === stageId)
  if (idx !== -1) seedStageContents.splice(idx, 1)
}

const reorderContents = async (stageId: string, contentIds: string[]): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200))
  const items = seedStageContents.filter((c) => c.program_stage_id === stageId)
  const map = new Map(items.map((c) => [c.id, c]))
  contentIds.forEach((id, index) => {
    const item = map.get(id)
    if (item) item.sort_order = index + 1
  })
}

export const mockProgramService: ProgramService = {
  getAll,
  getById,
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

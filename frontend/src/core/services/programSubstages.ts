// programSubstages.ts — backend-backed Kegiatan (ProgramSubstage) service.
//
// Mirrors the backend /api/program-substages contract (Fase 5): list Kegiatan
// for a SubTopik, create/update/reorder/delete, and the per-leaf badge image
// upload. Uses the shared apiEnvelope helpers (tenant header + envelope
// unwrap) so auth/tenant scoping is identical to every other service.

import type { ProgramSubstage } from '../types'
import { arrayRequest, itemRequest, voidRequest } from './apiEnvelope'
import { API_ROUTES } from '../constants/apiRoutes'

export interface ProgramSubstageService {
  listByStage(programStageId: string): Promise<ProgramSubstage[]>
  create(data: CreateProgramSubstageDTO): Promise<ProgramSubstage>
  update(id: string, data: UpdateProgramSubstageDTO): Promise<ProgramSubstage>
  reorder(orderedIds: string[]): Promise<void>
  remove(id: string): Promise<void>
}

export interface CreateProgramSubstageDTO {
  program_stage_id: string
  sequence_order: number
  name: string
  description?: string
  duration_minutes: number
  is_photo_stage: boolean
}

export type UpdateProgramSubstageDTO = Partial<CreateProgramSubstageDTO>

const listByStage = async (programStageId: string): Promise<ProgramSubstage[]> => {
  return arrayRequest<ProgramSubstage>(
    'GET',
    API_ROUTES.PROGRAM_SUBSTAGES.BY_STAGE(programStageId),
  ).then((items) =>
    [...items].sort((a, b) => a.sequence_order - b.sequence_order),
  )
}

const create = async (data: CreateProgramSubstageDTO): Promise<ProgramSubstage> => {
  return itemRequest<ProgramSubstage>('POST', API_ROUTES.PROGRAM_SUBSTAGES.BASE, {
    program_stage_id: data.program_stage_id,
    sequence_order: data.sequence_order,
    name: data.name,
    description: data.description ?? '',
    duration_minutes: data.duration_minutes,
    is_photo_stage: data.is_photo_stage,
  })
}

const update = async (
  id: string,
  data: UpdateProgramSubstageDTO,
): Promise<ProgramSubstage> => {
  const body: Record<string, unknown> = {}
  if (data.program_stage_id !== undefined) body.program_stage_id = data.program_stage_id
  if (data.sequence_order !== undefined) body.sequence_order = data.sequence_order
  if (data.name !== undefined) body.name = data.name
  if (data.description !== undefined) body.description = data.description
  if (data.duration_minutes !== undefined) body.duration_minutes = data.duration_minutes
  if (data.is_photo_stage !== undefined) body.is_photo_stage = data.is_photo_stage
  return itemRequest<ProgramSubstage>('PUT', API_ROUTES.PROGRAM_SUBSTAGES.DETAIL(id), body)
}

const reorder = async (orderedIds: string[]): Promise<void> => {
  await voidRequest('POST', API_ROUTES.PROGRAM_SUBSTAGES.REORDER, { ordered_ids: orderedIds })
}

const remove = async (id: string): Promise<void> => {
  await voidRequest('DELETE', API_ROUTES.PROGRAM_SUBSTAGES.DETAIL(id))
}

export const programSubstageService: ProgramSubstageService = {
  listByStage,
  create,
  update,
  reorder,
  remove,
}

import type { CreateParticipantDTO, Participant, Session, Report, SmartPhoto, Recording, Assessment } from '../../types'
import type { ListParams, PaginatedResponse } from '../../types'
import type { ParticipantService } from '../types'
import { AppError } from '../../utils/errors'
import { getAll as idbGetAll, getById as idbGetById, put, deleteById, queryByIndex } from '../storage/idb'
import { getTenantScope } from '../tenantScope'

const STORE_NAME = 'participants'

const paginate = <T>(data: T[], page: number, limit: number): PaginatedResponse<T> => ({
  data: data.slice((page - 1) * limit, (page - 1) * limit + limit),
  total: data.length,
  page,
  limit,
  totalPages: Math.ceil(data.length / limit),
})

const matchesSearch = (participant: Participant, query: string) => {
  const q = query.toLowerCase()
  return [
    participant.child_name,
    participant.parent_name,
    participant.parent_phone,
    participant.parent_email,
    participant.school_name,
  ].some((value) => value?.toLowerCase().includes(q))
}

const getAll = async (params?: ListParams): Promise<PaginatedResponse<Participant>> => {
  await new Promise((r) => setTimeout(r, 200))
  let data = await idbGetAll<Participant>(STORE_NAME)

  const scope = getTenantScope()
  if (scope.tenantId || scope.blocked) {
    const sessions = await idbGetAll<Session>('sessions')
    const sessionTenantMap = new Map(sessions.map((s) => [s.id, s.tenant_id]))
    const validSessionIds = new Set(
      sessions.filter((s) => s.tenant_id === scope.tenantId).map((s) => s.id)
    )

    data = data.filter((p) => {
      if (!p.session_id) return false
      if (!sessionTenantMap.has(p.session_id)) return false
      return validSessionIds.has(p.session_id)
    })
  }

  if (params?.search) {
    data = data.filter((participant) => matchesSearch(participant, params.search!))
  }

  const page = params?.page ?? 1
  const limit = params?.limit ?? 10
  return paginate(data, page, limit)
}

const getById = async (id: string): Promise<Participant | null> => {
  await new Promise((r) => setTimeout(r, 100))
  return await idbGetById<Participant>(STORE_NAME, id)
}

const create = async (data: CreateParticipantDTO): Promise<Participant> => {
  await new Promise((r) => setTimeout(r, 250))
  const participant: Participant = {
    id: `part-${Date.now()}`,
    child_name: data.child_name,
    child_age: data.child_age,
    school_name: data.school_name,
    parent_name: data.parent_name,
    parent_phone: data.parent_phone,
    parent_email: data.parent_email,
    consent_recording: false,
    consent_photo: false,
    created_at: new Date().toISOString(),
    ...(data.group_id ? { group_id: data.group_id } : {}),
  }

  await put(STORE_NAME, participant)
  return participant
}

const update = async (id: string, data: Partial<CreateParticipantDTO>): Promise<Participant> => {
  await new Promise((r) => setTimeout(r, 250))
  const participant = await idbGetById<Participant>(STORE_NAME, id)
  if (!participant) {
    throw new AppError('NOT_FOUND', 'Peserta tidak ditemukan')
  }

  const updated: Participant = {
    ...participant,
    child_name: data.child_name ?? participant.child_name,
    child_age: data.child_age ?? participant.child_age,
    school_name: data.school_name !== undefined ? data.school_name : participant.school_name,
    parent_name: data.parent_name ?? participant.parent_name,
    parent_phone: data.parent_phone ?? participant.parent_phone,
    parent_email: data.parent_email !== undefined ? data.parent_email : participant.parent_email,
    group_id: data.group_id !== undefined ? data.group_id : participant.group_id,
  }

  await put(STORE_NAME, updated)
  return updated
}

const remove = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 250))
  const participant = await idbGetById<Participant>(STORE_NAME, id)
  if (!participant) {
    throw new AppError('NOT_FOUND', 'Peserta tidak ditemukan')
  }

  if (participant.session_id || participant.group_id) {
    throw new AppError('CONFLICT', 'Peserta yang sudah masuk sesi tidak dapat dihapus dari menu Peserta')
  }

  const [assessments, photos, recordings, reports] = await Promise.all([
    queryByIndex<Assessment>('assessments', 'participant_id', id),
    queryByIndex<SmartPhoto>('smart_photos', 'participant_id', id),
    queryByIndex<Recording>('recordings', 'participant_id', id),
    queryByIndex<Report>('reports', 'participant_id', id),
  ])

  if (assessments.length > 0 || photos.length > 0 || recordings.length > 0 || reports.length > 0) {
    throw new AppError('CONFLICT', 'Peserta memiliki data aktivitas dan tidak dapat dihapus')
  }

  await deleteById(STORE_NAME, id)
}

export const mockParticipantService: ParticipantService = {
  getAll,
  getById,
  create,
  update,
  delete: remove,
}

import type {
  Session,
  SessionStage,
  SessionGroup,
  Participant,
  CreateParticipantDTO,
  CreateSessionDTO,
  UpdateSessionDTO,
  ProgramStage,
} from '../../types'
import { SessionStatus, GroupStatus, SessionStageStatus } from '../../types'
import { getAll, getById, put, putMany, queryByIndex, deleteById, deleteByIndex } from '../storage/idb'
import { AppError } from '../../utils/errors'
import { getTenantScope, requireTenantId } from '../tenantScope'

const getAll_ = async (params?: { page?: number; limit?: number; search?: string; status?: string }): Promise<{
  data: Session[]
  total: number
  page: number
  limit: number
  totalPages: number
}> => {
  await new Promise((r) => setTimeout(r, 200))
  let data = await getAll<Session>('sessions')

  const scope = getTenantScope()
  if (scope.tenantId) {
    data = data.filter((s) => s.tenant_id === scope.tenantId)
  } else if (scope.blocked) {
    data = []
  }
  
  if (params?.search) {
    const q = params.search.toLowerCase()
    data = data.filter((s) => s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q))
  }
  if (params?.status) {
    data = data.filter((s) => s.status === params.status)
  }
  
  const page = params?.page ?? 1
  const limit = params?.limit ?? 10
  const start = (page - 1) * limit
  return {
    data: data.slice(start, start + limit),
    total: data.length,
    page,
    limit,
    totalPages: Math.ceil(data.length / limit),
  }
}

const getById_ = async (id: string): Promise<(Session & { stages: SessionStage[]; groups: (SessionGroup & { participants: Participant[] })[] }) | null> => {
  await new Promise((r) => setTimeout(r, 100))
  const session = await getById<Session>('sessions', id)
  if (!session) return null
  
  // Hydrate stages from IDB
  const stages = await queryByIndex<SessionStage>('session_stages', 'session_id', id)
  
  // Hydrate groups from IDB
  const groups = await queryByIndex<SessionGroup>('session_groups', 'session_id', id)
  
  // Hydrate participants for each group
  const groupsWithParticipants = await Promise.all(
    groups.map(async (g) => ({
      ...g,
      participants: await queryByIndex<Participant>('participants', 'group_id', g.id),
    }))
  )
  
  return { ...session, stages, groups: groupsWithParticipants }
}

const create = async (data: CreateSessionDTO): Promise<Session> => {
  await new Promise((r) => setTimeout(r, 300))
  const tenantId = requireTenantId()
  const session: Session = {
    id: `s-${Date.now()}`,
    tenant_id: tenantId,
    ...data,
    status: SessionStatus.DRAFT,
    created_by: 'u-1',
    created_at: new Date().toISOString(),
  }
  await put('sessions', session)
  try {
    const programStages = await queryByIndex<ProgramStage>('program_stages', 'program_id', data.program_id)
    const sessionStages: SessionStage[] = programStages.map(ps => ({
      id: `ss-${Date.now()}-${ps.sequence_order}`,
      session_id: session.id,
      program_stage_id: ps.id,
      status: SessionStageStatus.WAITING,
    }))
    if (sessionStages.length > 0) await putMany('session_stages', sessionStages)
  } catch {
    /* stages will be empty — acceptable */
  }
  return session
}

const update = async (id: string, data: UpdateSessionDTO): Promise<Session> => {
  await new Promise((r) => setTimeout(r, 300))
  const existing = await getById<Session>('sessions', id)
  if (!existing) throw new AppError('NOT_FOUND', 'Session not found')
  
  const updated = { ...existing, ...data }
  await put('sessions', updated)
  return updated
}

const start = async (id: string): Promise<Session> => {
  return update(id, { status: SessionStatus.ACTIVE })
}

const complete = async (id: string): Promise<Session> => {
  return update(id, { status: SessionStatus.COMPLETED })
}

const cancel = async (id: string): Promise<Session> => {
  return update(id, { status: SessionStatus.CANCELLED })
}

const delete_ = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 300))
  const session = await getById<Session>('sessions', id)
  if (!session) throw new AppError('NOT_FOUND', 'Session not found')
  if (session.status === SessionStatus.ACTIVE || session.status === SessionStatus.COMPLETED) {
    throw new AppError('VALIDATION_ERROR', 'Hanya sesi DRAFT atau CANCELLED yang dapat dihapus')
  }

  const [stages, groups] = await Promise.all([
    queryByIndex<SessionStage>('session_stages', 'session_id', id),
    queryByIndex<SessionGroup>('session_groups', 'session_id', id),
  ])

  await Promise.all([
    deleteByIndex('session_stages', 'session_id', id),
    deleteByIndex('participants', 'session_id', id),
    deleteByIndex('smart_photos', 'session_id', id),
    deleteByIndex('reports', 'session_id', id),
    deleteByIndex('session_groups', 'session_id', id),
    ...groups.flatMap(g => [
      deleteByIndex('group_stage_progress', 'group_id', g.id),
    ]),
    ...stages.flatMap(s => [
      deleteByIndex('assessments', 'session_stage_id', s.id),
      deleteByIndex('recordings', 'session_stage_id', s.id),
    ]),
  ])

  await deleteById('sessions', id)
}

const assignFacilitator = async (sessionId: string, stageId: string, userId: string): Promise<SessionStage> => {
  await new Promise((r) => setTimeout(r, 200))
  const stage = await getById<SessionStage>('session_stages', stageId)
  if (!stage || stage.session_id !== sessionId) throw new AppError('NOT_FOUND', 'Stage not found')
  
  stage.fasilitator_id = userId
  await put('session_stages', stage)
  return stage
}

const getStages = async (sessionId: string): Promise<SessionStage[]> => {
  await new Promise((r) => setTimeout(r, 150))
  return await queryByIndex<SessionStage>('session_stages', 'session_id', sessionId)
}

const getGroups = async (sessionId: string): Promise<SessionGroup[]> => {
  await new Promise((r) => setTimeout(r, 150))
  return await queryByIndex<SessionGroup>('session_groups', 'session_id', sessionId)
}

const createGroup = async (sessionId: string, name: string): Promise<SessionGroup> => {
  await new Promise((r) => setTimeout(r, 250))
  const group: SessionGroup = {
    id: `g-${Date.now()}`,
    session_id: sessionId,
    name,
    status: GroupStatus.WAITING,
    created_at: new Date().toISOString(),
  }
  await put('session_groups', group)
  return group
}

const updateGroup = async (sessionId: string, groupId: string, name: string): Promise<SessionGroup> => {
  await new Promise((r) => setTimeout(r, 250))
  const group = await getById<SessionGroup>('session_groups', groupId)
  if (!group || group.session_id !== sessionId) throw new AppError('NOT_FOUND', 'Group not found')
  
  group.name = name
  await put('session_groups', group)
  return group
}

const deleteGroup = async (sessionId: string, groupId: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 250))
  const group = await getById<SessionGroup>('session_groups', groupId)
  if (group && group.session_id === sessionId) {
    await deleteById('session_groups', groupId)
  }
}

const getParticipants = async (sessionId: string, groupId?: string): Promise<Participant[]> => {
  await new Promise((r) => setTimeout(r, 150))
  if (groupId) {
    return await queryByIndex<Participant>('participants', 'group_id', groupId)
  }
  return await queryByIndex<Participant>('participants', 'session_id', sessionId)
}

const getParticipantById = async (participantId: string): Promise<Participant | null> => {
  await new Promise((r) => setTimeout(r, 100))
  return await getById<Participant>('participants', participantId)
}

const addParticipant = async (sessionId: string, groupId: string, data: CreateParticipantDTO): Promise<Participant> => {
  await new Promise((r) => setTimeout(r, 250))
  const session = await getById<Session>('sessions', sessionId)
  const participant: Participant = {
    id: `part-${Date.now()}`,
    tenant_id: session?.tenant_id,
    session_id: sessionId,
    group_id: groupId,
    child_name: data.child_name,
    child_age: data.child_age,
    school_name: data.school_name,
    parent_name: data.parent_name,
    parent_phone: data.parent_phone,
    parent_email: data.parent_email,
    consent_recording: false,
    consent_photo: false,
    created_at: new Date().toISOString(),
  }
  await put('participants', participant)
  return participant
}

const linkParticipant = async (sessionId: string, groupId: string, participantId: string): Promise<Participant> => {
  await new Promise((r) => setTimeout(r, 250))
  const participant = await getById<Participant>('participants', participantId)
  if (!participant) throw new AppError('NOT_FOUND', 'Peserta tidak ditemukan')
  if (participant.session_id) throw new AppError('CONFLICT', 'Peserta sudah masuk dalam sesi lain')
  participant.session_id = sessionId
  participant.group_id = groupId
  await put('participants', participant)
  return participant
}

const updateParticipant = async (
  sessionId: string,
  participantId: string,
  data: Partial<CreateParticipantDTO>
): Promise<Participant> => {
  await new Promise((r) => setTimeout(r, 250))
  const participant = await getById<Participant>('participants', participantId)
  if (!participant || participant.session_id !== sessionId) throw new AppError('NOT_FOUND', 'Participant not found')
  
  Object.assign(participant, data)
  await put('participants', participant)
  return participant
}

const removeParticipant = async (sessionId: string, participantId: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 250))
  const participant = await getById<Participant>('participants', participantId)
  if (participant && participant.session_id === sessionId) {
    await deleteById('participants', participantId)
  }
}

const importParticipants = async (sessionId: string, rows: CreateParticipantDTO[]): Promise<Participant[]> => {
  await new Promise((r) => setTimeout(r, 400))
  for (const row of rows) {
    if (!row.group_id) {
      throw new AppError('VALIDATION_ERROR', 'Group ID is required for session import')
    }
  }

  const created: Participant[] = []
  try {
    for (const row of rows) {
      const participant = await addParticipant(sessionId, row.group_id!, {
        child_name: row.child_name,
        child_age: row.child_age,
        school_name: row.school_name,
        parent_name: row.parent_name,
        parent_phone: row.parent_phone,
        parent_email: row.parent_email,
        group_id: row.group_id,
      })
      created.push(participant)
    }
    return created
  } catch (err) {
    for (const p of created) {
      await deleteById('participants', p.id).catch(() => {})
    }
    throw err
  }
}

export const mockSessionService = {
  getAll: getAll_,
  getById: getById_,
  create,
  update,
  start,
  complete,
  cancel,
  delete: delete_,
  assignFacilitator,
  getStages,
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getParticipants,
  getParticipantById,
  addParticipant,
  linkParticipant,
  updateParticipant,
  removeParticipant,
  importParticipants,
}

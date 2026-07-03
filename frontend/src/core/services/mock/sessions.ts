import type {
  Session,
  SessionStage,
  SessionGroup,
  Participant,
  CreateParticipantDTO,
  CreateSessionDTO,
  UpdateSessionDTO,
} from '../../types'
import { SessionStatus, GroupStatus } from '../../types'
import { seedSessions, seedSessionStages, seedSessionGroups, seedParticipants } from './data/seed'
import { mockStorage } from './db'

const SESSION_STORAGE_KEY = 'sessions_v1'

const init = () => {
  const existing = mockStorage.get<Session[]>(SESSION_STORAGE_KEY, [])
  if (existing.length) return existing
  mockStorage.set(SESSION_STORAGE_KEY, seedSessions)
  return seedSessions
}

const getAll = async (params?: { page?: number; limit?: number; search?: string; status?: string }): Promise<{
  data: Session[]
  total: number
  page: number
  limit: number
  totalPages: number
}> => {
  await new Promise((r) => setTimeout(r, 200))
  let data = init()
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

const getById = async (id: string): Promise<(Session & { stages: SessionStage[]; groups: (SessionGroup & { participants: Participant[] })[] }) | null> => {
  await new Promise((r) => setTimeout(r, 100))
  const session = init().find((s) => s.id === id)
  if (!session) return null
  const stages = seedSessionStages.filter((s) => s.session_id === id)
  const groups = seedSessionGroups
    .filter((g) => g.session_id === id)
    .map((g) => ({
      ...g,
      participants: seedParticipants.filter((p) => p.group_id === g.id),
    }))
  return { ...session, stages, groups }
}

const create = async (data: CreateSessionDTO): Promise<Session> => {
  await new Promise((r) => setTimeout(r, 300))
  const sessions = init()
  const session: Session = {
    id: `s-${Date.now()}`,
    tenant_id: 't-1',
    ...data,
    status: SessionStatus.DRAFT,
    created_by: 'u-1',
    created_at: new Date().toISOString(),
  }
  sessions.push(session)
  mockStorage.set(SESSION_STORAGE_KEY, sessions)
  return session
}

const update = async (id: string, data: UpdateSessionDTO): Promise<Session> => {
  await new Promise((r) => setTimeout(r, 300))
  const sessions = init()
  const idx = sessions.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error('Session not found')
  sessions[idx] = { ...sessions[idx], ...data }
  mockStorage.set(SESSION_STORAGE_KEY, sessions)
  return sessions[idx]
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

const assignFacilitator = async (sessionId: string, stageId: string, userId: string): Promise<SessionStage> => {
  await new Promise((r) => setTimeout(r, 200))
  const stage = seedSessionStages.find((s) => s.session_id === sessionId && s.id === stageId)
  if (!stage) throw new Error('Stage not found')
  stage.fasilitator_id = userId
  return stage
}

const getStages = async (sessionId: string): Promise<SessionStage[]> => {
  await new Promise((r) => setTimeout(r, 150))
  return seedSessionStages.filter((s) => s.session_id === sessionId)
}

const getGroups = async (sessionId: string): Promise<SessionGroup[]> => {
  await new Promise((r) => setTimeout(r, 150))
  return seedSessionGroups.filter((g) => g.session_id === sessionId)
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
  seedSessionGroups.push(group)
  return group
}

const updateGroup = async (sessionId: string, groupId: string, name: string): Promise<SessionGroup> => {
  await new Promise((r) => setTimeout(r, 250))
  const group = seedSessionGroups.find((g) => g.session_id === sessionId && g.id === groupId)
  if (!group) throw new Error('Group not found')
  group.name = name
  return group
}

const deleteGroup = async (sessionId: string, groupId: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 250))
  const idx = seedSessionGroups.findIndex((g) => g.session_id === sessionId && g.id === groupId)
  if (idx !== -1) seedSessionGroups.splice(idx, 1)
}

const getParticipants = async (sessionId: string, groupId?: string): Promise<Participant[]> => {
  await new Promise((r) => setTimeout(r, 150))
  let data = seedParticipants.filter((p) => p.session_id === sessionId)
  if (groupId) data = data.filter((p) => p.group_id === groupId)
  return data
}

const addParticipant = async (sessionId: string, groupId: string, data: CreateParticipantDTO): Promise<Participant> => {
  await new Promise((r) => setTimeout(r, 250))
  const participant: Participant = {
    id: `part-${Date.now()}`,
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
  seedParticipants.push(participant)
  return participant
}

const updateParticipant = async (
  sessionId: string,
  participantId: string,
  data: Partial<CreateParticipantDTO>
): Promise<Participant> => {
  await new Promise((r) => setTimeout(r, 250))
  const participant = seedParticipants.find((p) => p.session_id === sessionId && p.id === participantId)
  if (!participant) throw new Error('Participant not found')
  Object.assign(participant, data)
  return participant
}

const removeParticipant = async (sessionId: string, participantId: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 250))
  const idx = seedParticipants.findIndex((p) => p.session_id === sessionId && p.id === participantId)
  if (idx !== -1) seedParticipants.splice(idx, 1)
}

const importParticipants = async (sessionId: string, rows: CreateParticipantDTO[]): Promise<Participant[]> => {
  await new Promise((r) => setTimeout(r, 400))
  return Promise.all(
    rows.map((row) =>
      addParticipant(sessionId, row.group_id, {
        child_name: row.child_name,
        child_age: row.child_age,
        school_name: row.school_name,
        parent_name: row.parent_name,
        parent_phone: row.parent_phone,
        parent_email: row.parent_email,
        group_id: row.group_id,
      })
    )
  )
}

export const mockSessionService = {
  getAll,
  getById,
  create,
  update,
  start,
  complete,
  cancel,
  assignFacilitator,
  getStages,
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getParticipants,
  addParticipant,
  updateParticipant,
  removeParticipant,
  importParticipants,
}

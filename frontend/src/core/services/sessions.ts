import type { SessionService } from './types'
import type {
  Session,
  SessionStage,
  SessionGroup,
  Participant,
  CreateParticipantDTO,
  CreateSessionDTO,
  UpdateSessionDTO,
  ParticipantSessionInfo,
  LinkParticipantResponse,
  ImportResult,
} from '../types'
import { listRequest, itemRequest, voidRequest, arrayRequest, normalizeTenantId } from './apiEnvelope'
import { API_ROUTES } from '../constants/apiRoutes'

export const sessionService: SessionService = {
  getAll: (params) => listRequest<Session>(API_ROUTES.SESSIONS.BASE, params),

  getById: async (id) => {
    try {
      const detail = await itemRequest<{
        session: Session
        stages: SessionStage[]
        groups: (SessionGroup & { participants: Participant[] })[]
      }>('GET', API_ROUTES.SESSIONS.DETAIL(id))
      // EC3: default stages to [] if the backend omits them.
      const session = normalizeTenantId(detail.session)
      return {
        ...session,
        stages: (detail.stages ?? []).map(normalizeTenantId),
        groups: (detail.groups ?? []).map((g) => ({
          ...normalizeTenantId(g),
          participants: (g.participants ?? []).map(normalizeTenantId),
        })),
      }
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        return null
      }
      throw err
    }
  },

  create: (data: CreateSessionDTO) =>
    itemRequest<Session>('POST', API_ROUTES.SESSIONS.BASE, {
      program_id: data.program_id,
      name: data.name,
      session_date: data.session_date,
      start_time: data.start_time,
      end_time: data.end_time,
      location: data.location,
      notes: data.notes,
    }),

  update: (id, data: UpdateSessionDTO) =>
    itemRequest<Session>('PUT', API_ROUTES.SESSIONS.DETAIL(id), {
      program_id: data.program_id,
      name: data.name,
      session_date: data.session_date,
      start_time: data.start_time,
      end_time: data.end_time,
      location: data.location,
      notes: data.notes,
      status: data.status,
    }),

  start: (id) => itemRequest<Session>('POST', API_ROUTES.SESSIONS.START(id)),
  complete: (id) => itemRequest<Session>('POST', API_ROUTES.SESSIONS.COMPLETE(id)),
  cancel: (id) => itemRequest<Session>('POST', API_ROUTES.SESSIONS.CANCEL(id)),

  delete: (id) => voidRequest('DELETE', API_ROUTES.SESSIONS.DETAIL(id)),

  getStages: (sessionId) =>
    arrayRequest<SessionStage>('GET', API_ROUTES.SESSIONS.STAGES(sessionId)),

  getGroups: (sessionId) =>
    arrayRequest<SessionGroup>('GET', API_ROUTES.SESSIONS.GROUPS(sessionId)),

  createGroup: (sessionId, name) =>
    itemRequest<SessionGroup>('POST', API_ROUTES.SESSIONS.GROUPS(sessionId), { name }),

  updateGroup: (sessionId, groupId, { name, facilitatorId }) =>
    itemRequest<SessionGroup>('PUT', API_ROUTES.SESSIONS.GROUP_DETAIL(sessionId, groupId), {
      name,
      facilitator_id: facilitatorId || null,
    }),

  deleteGroup: (sessionId, groupId) =>
    voidRequest('DELETE', API_ROUTES.SESSIONS.GROUP_DETAIL(sessionId, groupId)),

  getParticipants: (sessionId, groupId) =>
    arrayRequest<Participant>('GET', API_ROUTES.SESSIONS.PARTICIPANTS(sessionId, groupId)),

  getParticipantById: async (participantId) => {
    try {
      return await itemRequest<Participant>('GET', API_ROUTES.PARTICIPANTS.DETAIL(participantId))
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        return null
      }
      throw err
    }
  },

  addParticipant: (sessionId, groupId, data: CreateParticipantDTO) =>
    itemRequest<Participant>('POST', API_ROUTES.SESSIONS.PARTICIPANTS(sessionId), {
      child_name: data.child_name,
      child_age: data.child_age,
      school_name: data.school_name,
      parent_name: data.parent_name,
      parent_phone: data.parent_phone,
      parent_email: data.parent_email,
      group_id: data.group_id ?? groupId,
      consent_recording: false,
      consent_photo: false,
    }),

  linkParticipant: (sessionId, groupId, participantId) =>
    itemRequest<LinkParticipantResponse>('POST', API_ROUTES.SESSIONS.LINK_PARTICIPANT(sessionId), {
      participant_id: participantId,
      group_id: groupId,
    }),

  updateParticipant: (sessionId, participantId, data: Partial<CreateParticipantDTO>) =>
    itemRequest<Participant>('PUT', API_ROUTES.SESSIONS.PARTICIPANT_DETAIL(sessionId, participantId), {
      child_name: data.child_name,
      child_age: data.child_age,
      school_name: data.school_name,
      parent_name: data.parent_name,
      parent_phone: data.parent_phone,
      parent_email: data.parent_email,
      group_id: data.group_id,
      consent_recording: false,
      consent_photo: false,
    }),

  removeParticipant: (sessionId, participantId) =>
    voidRequest('DELETE', API_ROUTES.SESSIONS.PARTICIPANT_DETAIL(sessionId, participantId)),

  importParticipants: (sessionId, rows: CreateParticipantDTO[]) =>
    itemRequest<ImportResult>(
      'POST',
      API_ROUTES.SESSIONS.IMPORT_PARTICIPANTS(sessionId),
      {
        rows: rows.map((r) => ({
          child_name: r.child_name,
          child_age: r.child_age,
          school_name: r.school_name,
          parent_name: r.parent_name,
          parent_phone: r.parent_phone,
          parent_email: r.parent_email,
          group_id: r.group_id,
          consent_recording: false,
          consent_photo: false,
        })),
      },
    ),

  getLinkableParticipants: (sessionId) =>
    arrayRequest<ParticipantSessionInfo>('GET', API_ROUTES.SESSIONS.LINKABLE_PARTICIPANTS(sessionId)),
}

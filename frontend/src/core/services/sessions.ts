import type { SessionService } from './types'
import type {
  Session,
  SessionStage,
  SessionGroup,
  Participant,
  CreateParticipantDTO,
  CreateSessionDTO,
  UpdateSessionDTO,
} from '../types'
import { listRequest, itemRequest, voidRequest, arrayRequest } from './apiEnvelope'

export const sessionService: SessionService = {
  getAll: (params) => listRequest<Session>('/api/sessions', params),

  getById: async (id) => {
    try {
      const detail = await itemRequest<{
        session: Session
        stages: SessionStage[]
        groups: (SessionGroup & { participants: Participant[] })[]
      }>('GET', `/api/sessions/${id}`)
      // EC3: default stages to [] if the backend omits them.
      return {
        ...detail.session,
        stages: detail.stages ?? [],
        groups: detail.groups ?? [],
      }
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        return null
      }
      throw err
    }
  },

  create: (data: CreateSessionDTO) =>
    itemRequest<Session>('POST', '/api/sessions', {
      program_id: data.program_id,
      name: data.name,
      session_date: data.session_date,
      location: data.location,
      notes: data.notes,
    }),

  update: (id, data: UpdateSessionDTO) =>
    itemRequest<Session>('PUT', `/api/sessions/${id}`, {
      program_id: data.program_id,
      name: data.name,
      session_date: data.session_date,
      location: data.location,
      notes: data.notes,
      status: data.status,
    }),

  start: (id) => itemRequest<Session>('POST', `/api/sessions/${id}/start`),
  complete: (id) => itemRequest<Session>('POST', `/api/sessions/${id}/complete`),
  cancel: (id) => itemRequest<Session>('POST', `/api/sessions/${id}/cancel`),

  delete: (id) => voidRequest('DELETE', `/api/sessions/${id}`),

  assignFacilitator: (sessionId, stageId, userId) =>
    itemRequest<SessionStage>('POST', `/api/sessions/${sessionId}/stages/${stageId}/assign`, {
      facilitator_id: userId,
    }),

  getStages: (sessionId) =>
    arrayRequest<SessionStage>('GET', `/api/sessions/${sessionId}/stages`),

  getGroups: (sessionId) =>
    arrayRequest<SessionGroup>('GET', `/api/sessions/${sessionId}/groups`),

  createGroup: (sessionId, name) =>
    itemRequest<SessionGroup>('POST', `/api/sessions/${sessionId}/groups`, { name }),

  updateGroup: (sessionId, groupId, name) =>
    itemRequest<SessionGroup>('PUT', `/api/sessions/${sessionId}/groups/${groupId}`, { name }),

  deleteGroup: (sessionId, groupId) =>
    voidRequest('DELETE', `/api/sessions/${sessionId}/groups/${groupId}`),

  getParticipants: (sessionId, groupId) => {
    const path = groupId
      ? `/api/sessions/${sessionId}/participants?group_id=${encodeURIComponent(groupId)}`
      : `/api/sessions/${sessionId}/participants`
    return arrayRequest<Participant>('GET', path)
  },

  getParticipantById: async (participantId) => {
    try {
      return await itemRequest<Participant>('GET', `/api/participants/${participantId}`)
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        return null
      }
      throw err
    }
  },

  addParticipant: (sessionId, groupId, data: CreateParticipantDTO) =>
    itemRequest<Participant>('POST', `/api/sessions/${sessionId}/participants`, {
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
    itemRequest<Participant>('POST', `/api/sessions/${sessionId}/participants/link`, {
      participant_id: participantId,
      group_id: groupId,
    }),

  updateParticipant: (sessionId, participantId, data: Partial<CreateParticipantDTO>) =>
    itemRequest<Participant>('PUT', `/api/sessions/${sessionId}/participants/${participantId}`, {
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
    voidRequest('DELETE', `/api/sessions/${sessionId}/participants/${participantId}`),

  importParticipants: (sessionId, rows: CreateParticipantDTO[]) =>
    itemRequest<Participant[]>(
      'POST',
      `/api/sessions/${sessionId}/participants/import`,
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
}

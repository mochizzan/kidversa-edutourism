import type { ParticipantService } from './types'
import type { Participant, CreateParticipantDTO } from '../types'
import { listRequest, itemRequest, voidRequest } from './apiEnvelope'

export const participantService: ParticipantService = {
  // B12: global, tenant-scoped list. listRequest loops pages when the caller
  // requests a large page (>=100, the backend's hard cap) so "fetch all"
  // callers (e.g. limit:1000) receive every row.
  getAll: (params) => listRequest<Participant>('/api/participants', params),

  // Global GET /api/participants/:id (tenant-scoped); matches the backend route.
  getById: async (id) => {
    try {
      return await itemRequest<Participant>('GET', `/api/participants/${id}`)
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        return null
      }
      throw err
    }
  },

  // Global participant writes: the backend currently exposes per-session
  // writes only (Fase 4 B12 is read-only). These target the global
  // /api/participants endpoints so the contract stays intact; writes without a
  // session are a backend gap to be filled in a later phase (the raw-idb
  // consumer refactor routes most writes through sessionService instead).
  create: (data: CreateParticipantDTO) =>
    itemRequest<Participant>('POST', '/api/participants', {
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

  update: (id, data: Partial<CreateParticipantDTO>) =>
    itemRequest<Participant>('PUT', `/api/participants/${id}`, {
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

  delete: (id) => voidRequest('DELETE', `/api/participants/${id}`),
}

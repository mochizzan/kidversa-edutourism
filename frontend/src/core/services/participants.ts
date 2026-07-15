import type { ParticipantService } from './types'
import type { Participant, CreateParticipantDTO } from '../types'
import { listRequest, itemRequest } from './apiEnvelope'

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

  // Global POST /api/participants — creates a standalone participant not yet
  // attached to a session. Consent flags default to false (the form does not
  // collect them); they can be set later via the per-session routes.
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
}

// Re-export the canonical way to create/update/delete participants so existing
// importers can switch with a one-line import change if needed.
export { sessionService } from './sessions'

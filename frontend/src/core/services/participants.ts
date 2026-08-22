import type { ParticipantService } from './types'
import type { Participant, CreateParticipantDTO } from '../types'
import { listRequest, itemRequest, nullableItemRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

export const participantService: ParticipantService = {
  // B12: global, tenant-scoped list. listRequest loops pages when the caller
  // requests a large page (>=100, the backend's hard cap) so "fetch all"
  // callers (e.g. limit:1000) receive every row.
  getAll: (params) => listRequest<Participant>(API_ROUTES.PARTICIPANTS.BASE, params),

  // Global GET /api/participants/:id (tenant-scoped); matches the backend route.
  getById: async (id) => {
    return nullableItemRequest<Participant>('GET', API_ROUTES.PARTICIPANTS.DETAIL(id))
  },

  // Global POST /api/participants — creates a standalone participant not yet
  // attached to a session. Consent flags default to false (the form does not
  // collect them); they can be set later via the per-session routes.
  create: (data: CreateParticipantDTO) =>
    itemRequest<Participant>('POST', API_ROUTES.PARTICIPANTS.BASE, {
      child_name: data.child_name,
      child_age: data.child_age,
      school_name: data.school_name,
      parent_name: data.parent_name,
      parent_phone: data.parent_phone,
      parent_email: data.parent_email,
      group_id: data.group_id,
      consent_photo: false,
    }),
}

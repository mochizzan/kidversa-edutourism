import type { ParticipantService } from './types'
import type { Participant } from '../types'
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

  // NOTE: writes to participants are NOT served by the global /api/participants
  // group (it mounts only GET "" and GET "/:id"). Writes go through the
  // per-session routes on sessionService (addParticipant/updateParticipant/
  // removeParticipant) — see participants.ts / sessionService. The old
  // create/update/delete methods here targeted non-existent global write routes
  // and were removed.
}

// Re-export the canonical way to create/update/delete participants so existing
// importers can switch with a one-line import change if needed.
export { sessionService } from './sessions'

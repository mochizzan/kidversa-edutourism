// badges.ts — backend-backed participant badge reads (Fase 5).
//
// GET /api/badges?participant_id= returns every ParticipantBadge for a child
// (SUBTOPIK rows carry program_stage_id; FINAL rows carry null). Read-only and
// JWT + TenantScope guarded by the backend; uses the shared envelope helpers.

import type { ParticipantBadge } from '../types'
import { arrayRequest } from './apiEnvelope'
import { API_ROUTES } from '../constants/apiRoutes'

const listByParticipant = async (participantId: string): Promise<ParticipantBadge[]> => {
  return arrayRequest<ParticipantBadge>(
    'GET',
    API_ROUTES.BADGES.BY_PARTICIPANT(participantId),
  )
}

export const badgeService = {
  listByParticipant,
}

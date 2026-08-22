import type { Assessment, CreateAssessmentDTO } from '../types'
import { SyncStatus } from '../types'
import type { AssessmentService } from './types'
import { arrayRequest, itemRequest, listRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

interface AssessmentUpsertRequest {
  participant_id: string
  session_id: string
  session_substage_id: string
  star_rating: number
  comment?: string
  assessed_at?: string
  sync_status?: string
}

const upsert = async (data: CreateAssessmentDTO): Promise<Assessment> => {
  // The backend derives `assessed_by` from the JWT, so the caller only supplies
  // `session_id` (resolved from the selected Kegiatan leaf) and the rating.
  return itemRequest<Assessment>('POST', `${API_ROUTES.ASSESSMENTS.BASE}/upsert`, {
    participant_id: data.participant_id,
    session_id: data.session_id,
    session_substage_id: data.session_substage_id,
    star_rating: data.star_rating,
    comment: data.comment,
    sync_status: SyncStatus.SYNCED,
  } as AssessmentUpsertRequest)
}

const bulkUpsert = async (data: CreateAssessmentDTO[]): Promise<Assessment[]> => {
  const items: AssessmentUpsertRequest[] = data.map((d) => ({
    participant_id: d.participant_id,
    session_id: d.session_id,
    session_substage_id: d.session_substage_id,
    star_rating: d.star_rating,
    comment: d.comment,
    sync_status: SyncStatus.SYNCED,
  }))
  return arrayRequest<Assessment>('POST', `${API_ROUTES.ASSESSMENTS.BASE}/bulk-upsert`, { items })
}

const getByParticipant = async (participantId: string): Promise<Assessment[]> => {
  return arrayRequest<Assessment>(
    'GET',
    API_ROUTES.ASSESSMENTS.BY_PARTICIPANT(participantId),
  )
}

const getBySession = async (sessionId: string): Promise<Assessment[]> => {
  const res = await listRequest<Assessment>(API_ROUTES.ASSESSMENTS.BASE, {
    filters: { session_id: sessionId },
    limit: 100,
  })
  return res.data
}

export const assessmentService: AssessmentService = {
  upsert,
  bulkUpsert,
  getByParticipant,
  getBySession,
}

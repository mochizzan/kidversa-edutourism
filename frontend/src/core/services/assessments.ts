import type { Assessment, CreateAssessmentDTO } from '../types'
import type { AssessmentService } from './types'
import { arrayRequest, itemRequest } from './apiEnvelope'
import { useAuthStore } from '../stores/authStore'
import { API_ROUTES } from '../constants/apiRoutes'

interface AssessmentUpsertRequest {
  participant_id: string
  session_id: string
  session_stage_id: string
  star_rating: number
  comment?: string
  assessed_by: string
  assessed_at?: string
  sync_status?: string
}

const upsert = async (data: CreateAssessmentDTO): Promise<Assessment> => {
  // The backend upsert DTO requires `session_id` and `assessed_by`. `session_id`
  // is carried on CreateAssessmentDTO (resolved by the caller from the stage);
  // `assessed_by` is the authenticated staff member performing the assessment.
  return itemRequest<Assessment>('POST', `${API_ROUTES.ASSESSMENTS.BASE}/upsert`, {
    participant_id: data.participant_id,
    session_id: data.session_id,
    session_stage_id: data.session_stage_id,
    star_rating: data.star_rating,
    comment: data.comment,
    assessed_by: useAuthStore.getState().user?.id ?? '',
    sync_status: 'synced',
  } as AssessmentUpsertRequest)
}

const bulkUpsert = async (data: CreateAssessmentDTO[]): Promise<Assessment[]> => {
  const assessedBy = useAuthStore.getState().user?.id ?? ''
  const items: AssessmentUpsertRequest[] = data.map((d) => ({
    participant_id: d.participant_id,
    session_id: d.session_id,
    session_stage_id: d.session_stage_id,
    star_rating: d.star_rating,
    comment: d.comment,
    assessed_by: assessedBy,
    sync_status: 'synced',
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
  return arrayRequest<Assessment>(
    'GET',
    API_ROUTES.ASSESSMENTS.BY_SESSION(sessionId),
  )
}

export const assessmentService: AssessmentService = {
  upsert,
  bulkUpsert,
  getByParticipant,
  getBySession,
}

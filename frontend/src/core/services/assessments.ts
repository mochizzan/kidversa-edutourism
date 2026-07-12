import type { Assessment, CreateAssessmentDTO } from '../types'
import type { AssessmentService } from './types'
import { apiRequest } from './backendClient'

interface AssessmentListEnvelope {
  data: Assessment[]
  total: number
}

interface AssessmentUpsertRequest {
  participant_id: string
  session_id?: string
  session_stage_id: string
  star_rating: number
  comment?: string
  assessed_by: string
  assessed_at?: string
  sync_status?: string
}

interface AssessmentBulkUpsertRequest {
  items: AssessmentUpsertRequest[]
}

const upsert = async (data: CreateAssessmentDTO): Promise<Assessment> => {
  // NOTE: the backend's upsert DTO requires `session_id`, but the frontend
  // CreateAssessmentDTO does not carry it (a Fase 4/5 contract gap). We send
  // the fields available from the DTO; the backend is expected to resolve the
  // session via the stage. See plan EC9 / Fase 5 follow-up.
  return apiRequest<Assessment>('POST', '/api/assessments/upsert', {
    participant_id: data.participant_id,
    session_stage_id: data.session_stage_id,
    star_rating: data.star_rating,
    comment: data.comment,
    assessed_by: data.participant_id,
    sync_status: 'synced',
  } as AssessmentUpsertRequest)
}

const bulkUpsert = async (data: CreateAssessmentDTO[]): Promise<Assessment[]> => {
  const items: AssessmentUpsertRequest[] = data.map((d) => ({
    participant_id: d.participant_id,
    session_stage_id: d.session_stage_id,
    star_rating: d.star_rating,
    comment: d.comment,
    assessed_by: d.participant_id,
    sync_status: 'synced',
  }))
  const res = await apiRequest<Assessment[]>('POST', '/api/assessments/bulk-upsert', {
    items,
  } as AssessmentBulkUpsertRequest)
  return res
}

const getByParticipant = async (participantId: string): Promise<Assessment[]> => {
  const res = await apiRequest<AssessmentListEnvelope>(
    'GET',
    `/api/assessments?participant_id=${encodeURIComponent(participantId)}`,
  )
  return res.data ?? []
}

const getBySession = async (sessionId: string): Promise<Assessment[]> => {
  const res = await apiRequest<AssessmentListEnvelope>(
    'GET',
    `/api/assessments?session_id=${encodeURIComponent(sessionId)}`,
  )
  return res.data ?? []
}

export const assessmentService: AssessmentService = {
  upsert,
  bulkUpsert,
  getByParticipant,
  getBySession,
}

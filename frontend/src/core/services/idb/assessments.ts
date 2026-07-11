import type { Assessment, CreateAssessmentDTO, SessionStage } from '../../types'
import type { AssessmentService } from '../types'
import { SyncStatus } from '../../types'
import { getAll, put, queryByIndex } from '../storage/idb'

const STORE_NAME = 'assessments'

const upsert = async (data: CreateAssessmentDTO): Promise<Assessment> => {
  await new Promise((r) => setTimeout(r, 200))
  const all = await getAll<Assessment>(STORE_NAME)
  const existing = all.find(
    (a) => a.participant_id === data.participant_id && a.session_stage_id === data.session_stage_id
  )
  
  if (existing) {
    Object.assign(existing, {
      star_rating: data.star_rating,
      comment: data.comment ?? existing.comment,
      updated_at: new Date().toISOString(),
    })
    await put(STORE_NAME, existing)
    return existing
  }
  
  const assessment: Assessment = {
    id: `a-${Date.now()}`,
    participant_id: data.participant_id,
    session_stage_id: data.session_stage_id,
    star_rating: data.star_rating,
    comment: data.comment,
    assessed_by: 'u-3',
    assessed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sync_status: SyncStatus.LOCAL,
  }
  await put(STORE_NAME, assessment)
  return assessment
}

const bulkUpsert = async (data: CreateAssessmentDTO[]): Promise<Assessment[]> => {
  await new Promise((r) => setTimeout(r, 300))
  return Promise.all(data.map((d) => upsert(d)))
}

const getByParticipant = async (participantId: string): Promise<Assessment[]> => {
  await new Promise((r) => setTimeout(r, 100))
  return await queryByIndex<Assessment>(STORE_NAME, 'participant_id', participantId)
}

const getBySession = async (sessionId: string): Promise<Assessment[]> => {
  await new Promise((r) => setTimeout(r, 150))
  const stages = await queryByIndex<SessionStage>('session_stages', 'session_id', sessionId)
  const stageIds = stages.map((s) => s.id)
  const allAssessments = await getAll<Assessment>(STORE_NAME)
  return allAssessments.filter((a) => stageIds.includes(a.session_stage_id))
}

export const idbAssessmentService: AssessmentService = {
  upsert,
  bulkUpsert,
  getByParticipant,
  getBySession,
}

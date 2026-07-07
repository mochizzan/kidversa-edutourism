import type { Recording, SessionStage } from '../../types'
import type { RecordingService } from '../types'
import { RecordingsReviewStatus, SyncStatus } from '../../types'
import { getAll, getById, put, queryByIndex, deleteById } from '../storage/idb'
import { AppError } from '../../utils/errors'

const STORE_NAME = 'recordings'

const getBySession = async (sessionId: string): Promise<Recording[]> => {
  await new Promise((r) => setTimeout(r, 150))
  const stages = await queryByIndex<SessionStage>('session_stages', 'session_id', sessionId)
  const stageIds = stages.map((s) => s.id)
  const allRecordings = await getAll<Recording>(STORE_NAME)
  return allRecordings.filter((r) => stageIds.includes(r.session_stage_id))
}

const getByParticipant = async (participantId: string): Promise<Recording[]> => {
  await new Promise((r) => setTimeout(r, 100))
  return await queryByIndex<Recording>(STORE_NAME, 'participant_id', participantId)
}

const upload = async (
  participantId: string,
  sessionStageId: string,
  _file: File
): Promise<Recording> => {
  await new Promise((r) => setTimeout(r, 500))
  const recording: Recording = {
    id: `rec-${Date.now()}`,
    participant_id: participantId,
    session_stage_id: sessionStageId,
    file_url: URL.createObjectURL(_file),
    duration_seconds: 0,
    file_size_bytes: _file.size,
    review_status: RecordingsReviewStatus.PENDING,
    sync_status: SyncStatus.LOCAL,
    created_at: new Date().toISOString(),
  }
  await put(STORE_NAME, recording)
  return recording
}

const getById_ = async (id: string): Promise<Recording | null> => {
  await new Promise((r) => setTimeout(r, 100))
  return await getById<Recording>(STORE_NAME, id)
}

const update = async (id: string, data: Partial<Recording>): Promise<Recording> => {
  await new Promise((r) => setTimeout(r, 300))
  const existing = await getById<Recording>(STORE_NAME, id)
  if (!existing) throw new AppError('NOT_FOUND', 'Recording not found')
  
  const updated = { ...existing, ...data }
  await put(STORE_NAME, updated)
  return updated
}

const remove = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200))
  await deleteById(STORE_NAME, id)
}

export const mockRecordingService: RecordingService = {
  getBySession,
  getByParticipant,
  getById: getById_,
  update,
  upload,
  delete: remove,
}

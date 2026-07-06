import type { Assessment, CreateAssessmentDTO } from '../../types'
import type { AssessmentService } from '../types'
import { SyncStatus } from '../../types'
import { mockStorage } from './db'
import { seedSessionStages } from './data/seed'

const STORAGE_KEY = 'assessments_v1'

const init = (): Assessment[] => {
  const existing = mockStorage.get<Assessment[]>(STORAGE_KEY, [])
  if (existing.length) return existing
  const seed: Assessment[] = [
    {
      id: 'a-1',
      participant_id: 'part-1',
      session_stage_id: 'ss-1',
      star_rating: 4,
      comment: 'Anak sangat antusias mengenal profesi peternak',
      assessed_by: 'u-3',
      assessed_at: '2026-07-05T07:40:00.000Z',
      updated_at: '2026-07-05T07:40:00.000Z',
      sync_status: SyncStatus.SYNCED,
    },
    {
      id: 'a-2',
      participant_id: 'part-2',
      session_stage_id: 'ss-1',
      star_rating: 5,
      comment: 'Siti sangat aktif bertanya tentang sapi',
      assessed_by: 'u-3',
      assessed_at: '2026-07-05T07:42:00.000Z',
      updated_at: '2026-07-05T07:42:00.000Z',
      sync_status: SyncStatus.SYNCED,
    },
    {
      id: 'a-3',
      participant_id: 'part-3',
      session_stage_id: 'ss-1',
      star_rating: 3,
      comment: 'Masih malu-malu tapi mulai terbuka',
      assessed_by: 'u-3',
      assessed_at: '2026-07-05T07:38:00.000Z',
      updated_at: '2026-07-05T07:38:00.000Z',
      sync_status: SyncStatus.SYNCED,
    },
    {
      id: 'a-4',
      participant_id: 'part-4',
      session_stage_id: 'ss-4',
      star_rating: 5,
      comment: 'Dewi sangat senang belajar hidroponik',
      assessed_by: 'u-3',
      assessed_at: '2026-06-20T07:25:00.000Z',
      updated_at: '2026-06-20T07:25:00.000Z',
      sync_status: SyncStatus.SYNCED,
    },
  ]
  mockStorage.set(STORAGE_KEY, seed)
  return seed
}

const getAll = (): Assessment[] => mockStorage.get<Assessment[]>(STORAGE_KEY, init())

const upsert = async (data: CreateAssessmentDTO): Promise<Assessment> => {
  await new Promise((r) => setTimeout(r, 200))
  const all = getAll()
  const existing = all.find(
    (a) => a.participant_id === data.participant_id && a.session_stage_id === data.session_stage_id
  )
  if (existing) {
    Object.assign(existing, {
      star_rating: data.star_rating,
      comment: data.comment ?? existing.comment,
      updated_at: new Date().toISOString(),
    })
    mockStorage.set(STORAGE_KEY, all)
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
  all.push(assessment)
  mockStorage.set(STORAGE_KEY, all)
  return assessment
}

const bulkUpsert = async (data: CreateAssessmentDTO[]): Promise<Assessment[]> => {
  await new Promise((r) => setTimeout(r, 300))
  return Promise.all(data.map((d) => upsert(d)))
}

const getByParticipant = async (participantId: string): Promise<Assessment[]> => {
  await new Promise((r) => setTimeout(r, 100))
  return getAll().filter((a) => a.participant_id === participantId)
}

const getBySession = async (sessionId: string): Promise<Assessment[]> => {
  await new Promise((r) => setTimeout(r, 150))
  const stageIds = seedSessionStages
    .filter((s: { session_id: string }) => s.session_id === sessionId)
    .map((s: { id: string }) => s.id)
  return getAll().filter((a) => stageIds.includes(a.session_stage_id))
}

export const mockAssessmentService: AssessmentService = {
  upsert,
  bulkUpsert,
  getByParticipant,
  getBySession,
}

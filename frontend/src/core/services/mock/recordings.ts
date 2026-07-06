import type { Recording } from '../../types'
import type { RecordingService } from '../types'
import { RecordingsReviewStatus, SyncStatus } from '../../types'
import { mockStorage } from './db'
import { seedSessionStages } from './data/seed'

const STORAGE_KEY = 'recordings_v1'

const init = (): Recording[] => {
  const existing = mockStorage.get<Recording[]>(STORAGE_KEY, [])
  if (existing.length) return existing
  const seed: Recording[] = [
    {
      id: 'rec-1',
      participant_id: 'part-1',
      session_stage_id: 'ss-2',
      file_url: '/mock/recordings/budi-refleksi.mp4',
      duration_seconds: 45,
      file_size_bytes: 5_242_880,
      transcript_text:
        'Saya suka main sama sapi tadi... terus saya belajar kalau sapi makan rumput... saya juga lihat susu sapi...',
      emotion_tags_json: { antusias: 0.87, netral: 0.1, ragu: 0.03 },
      review_status: RecordingsReviewStatus.PENDING,
      sync_status: SyncStatus.SYNCED,
      created_at: '2026-07-05T08:30:00.000Z',
    },
    {
      id: 'rec-2',
      participant_id: 'part-2',
      session_stage_id: 'ss-2',
      file_url: '/mock/recordings/siti-refleksi.mp4',
      duration_seconds: 62,
      file_size_bytes: 7_340_032,
      transcript_text:
        'Saya suka sapinya besar-besar... saya mau jadi dokter hewan... sapi makan rumput hijau...',
      emotion_tags_json: { antusias: 0.72, netral: 0.2, ragu: 0.08 },
      review_status: RecordingsReviewStatus.PENDING,
      sync_status: SyncStatus.SYNCED,
      created_at: '2026-07-05T08:35:00.000Z',
    },
  ]
  mockStorage.set(STORAGE_KEY, seed)
  return seed
}

const getAll = (): Recording[] => mockStorage.get<Recording[]>(STORAGE_KEY, init())

const getBySession = async (sessionId: string): Promise<Recording[]> => {
  await new Promise((r) => setTimeout(r, 150))
  const stageIds = seedSessionStages
    .filter((s: { session_id: string }) => s.session_id === sessionId)
    .map((s: { id: string }) => s.id)
  return getAll().filter((r) => stageIds.includes(r.session_stage_id))
}

const getByParticipant = async (participantId: string): Promise<Recording[]> => {
  await new Promise((r) => setTimeout(r, 100))
  return getAll().filter((r) => r.participant_id === participantId)
}

const upload = async (
  participantId: string,
  sessionStageId: string,
  _file: File
): Promise<Recording> => {
  await new Promise((r) => setTimeout(r, 500))
  const all = getAll()
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
  all.push(recording)
  mockStorage.set(STORAGE_KEY, all)
  return recording
}

const getById = async (id: string): Promise<Recording | null> => {
  await new Promise((r) => setTimeout(r, 100))
  const all = getAll()
  return all.find((r) => r.id === id) || null
}

const update = async (id: string, data: Partial<Recording>): Promise<Recording> => {
  await new Promise((r) => setTimeout(r, 300))
  const all = getAll()
  const idx = all.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error('Recording not found')
  all[idx] = { ...all[idx], ...data }
  mockStorage.set(STORAGE_KEY, all)
  return all[idx]
}

const remove = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200))
  const all = getAll().filter((r) => r.id !== id)
  mockStorage.set(STORAGE_KEY, all)
}

export const mockRecordingService: RecordingService = {
  getBySession,
  getByParticipant,
  getById,
  update,
  upload,
  delete: remove,
}

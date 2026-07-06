import type { SmartPhoto } from '../../types'
import type { PhotoService } from '../types'
import { SyncStatus } from '../../types'
import { mockStorage } from './db'


const STORAGE_KEY = 'smart_photos_v1'

const init = (): SmartPhoto[] => {
  const existing = mockStorage.get<SmartPhoto[]>(STORAGE_KEY, [])
  if (existing.length) return existing
  const seed: SmartPhoto[] = [
    {
      id: 'sp-1',
      participant_id: 'part-1',
      session_id: 's-1',
      frame_id: 'f-1',
      original_file_url: '/mock/photos/budi-1-original.jpg',
      framed_file_url: '/mock/photos/budi-1-framed.jpg',
      is_report_photo: true,
      taken_by: 'u-3',
      taken_at: '2026-07-05T07:35:00.000Z',
      sync_status: SyncStatus.SYNCED,
    },
    {
      id: 'sp-2',
      participant_id: 'part-2',
      session_id: 's-1',
      frame_id: 'f-2',
      original_file_url: '/mock/photos/siti-1-original.jpg',
      framed_file_url: '/mock/photos/siti-1-framed.jpg',
      is_report_photo: true,
      taken_by: 'u-3',
      taken_at: '2026-07-05T07:36:00.000Z',
      sync_status: SyncStatus.SYNCED,
    },
    {
      id: 'sp-3',
      participant_id: 'part-3',
      session_id: 's-1',
      frame_id: 'f-1',
      original_file_url: '/mock/photos/ali-1-original.jpg',
      framed_file_url: '/mock/photos/ali-1-framed.jpg',
      is_report_photo: false,
      taken_by: 'u-3',
      taken_at: '2026-07-05T07:37:00.000Z',
      sync_status: SyncStatus.SYNCED,
    },
  ]
  mockStorage.set(STORAGE_KEY, seed)
  return seed
}

const getAll = (): SmartPhoto[] => mockStorage.get<SmartPhoto[]>(STORAGE_KEY, init())

const getBySession = async (sessionId: string): Promise<SmartPhoto[]> => {
  await new Promise((r) => setTimeout(r, 150))
  return getAll().filter((p) => p.session_id === sessionId)
}

const getByParticipant = async (participantId: string): Promise<SmartPhoto[]> => {
  await new Promise((r) => setTimeout(r, 100))
  return getAll().filter((p) => p.participant_id === participantId)
}

const upload = async (
  participantId: string,
  sessionId: string,
  _file: File
): Promise<SmartPhoto> => {
  await new Promise((r) => setTimeout(r, 500))
  const all = getAll()
  // Check max 10 photos per participant
  const participantPhotos = all.filter((p) => p.participant_id === participantId)
  if (participantPhotos.length >= 10) {
    throw new Error('MAX_PHOTOS_REACHED')
  }
  const photo: SmartPhoto = {
    id: `sp-${Date.now()}`,
    participant_id: participantId,
    session_id: sessionId,
    frame_id: undefined,
    original_file_url: URL.createObjectURL(_file),
    framed_file_url: undefined,
    is_report_photo: false,
    taken_by: 'u-3',
    taken_at: new Date().toISOString(),
    sync_status: SyncStatus.LOCAL,
  }
  all.push(photo)
  mockStorage.set(STORAGE_KEY, all)
  return photo
}

const setReportPhoto = async (
  photoId: string,
  isReportPhoto: boolean
): Promise<SmartPhoto> => {
  await new Promise((r) => setTimeout(r, 200))
  const all = getAll()
  const photo = all.find((p) => p.id === photoId)
  if (!photo) throw new Error('Photo not found')
  // Unset other report photos for this participant
  if (isReportPhoto) {
    all.forEach((p) => {
      if (p.participant_id === photo.participant_id && p.id !== photoId) {
        p.is_report_photo = false
      }
    })
  }
  photo.is_report_photo = isReportPhoto
  mockStorage.set(STORAGE_KEY, all)
  return photo
}

const remove = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200))
  const all = getAll().filter((p) => p.id !== id)
  mockStorage.set(STORAGE_KEY, all)
}

export const mockPhotoService: PhotoService = {
  getBySession,
  getByParticipant,
  upload,
  setReportPhoto,
  delete: remove,
}

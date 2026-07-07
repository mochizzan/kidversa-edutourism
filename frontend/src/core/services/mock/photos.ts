import type { SmartPhoto } from '../../types'
import type { PhotoService } from '../types'
import { SyncStatus } from '../../types'
import { getById, put, queryByIndex, deleteById } from '../storage/idb'
import { AppError } from '../../utils/errors'

const STORE_NAME = 'smart_photos'

const getBySession = async (sessionId: string): Promise<SmartPhoto[]> => {
  await new Promise((r) => setTimeout(r, 150))
  return await queryByIndex<SmartPhoto>(STORE_NAME, 'session_id', sessionId)
}

const getByParticipant = async (participantId: string): Promise<SmartPhoto[]> => {
  await new Promise((r) => setTimeout(r, 100))
  return await queryByIndex<SmartPhoto>(STORE_NAME, 'participant_id', participantId)
}

const upload = async (
  participantId: string,
  sessionId: string,
  _file: File
): Promise<SmartPhoto> => {
  await new Promise((r) => setTimeout(r, 500))
  
  // Check max 10 photos per participant
  const participantPhotos = await queryByIndex<SmartPhoto>(STORE_NAME, 'participant_id', participantId)
  if (participantPhotos.length >= 10) {
    throw new AppError('VALIDATION_ERROR', 'MAX_PHOTOS_REACHED')
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
  await put(STORE_NAME, photo)
  return photo
}

const setReportPhoto = async (
  photoId: string,
  isReportPhoto: boolean
): Promise<SmartPhoto> => {
  await new Promise((r) => setTimeout(r, 200))
  const photo = await getById<SmartPhoto>(STORE_NAME, photoId)
  if (!photo) throw new AppError('NOT_FOUND', 'Photo not found')
  
  // Unset other report photos for this participant
  if (isReportPhoto) {
    const participantPhotos = await queryByIndex<SmartPhoto>(STORE_NAME, 'participant_id', photo.participant_id)
    for (const p of participantPhotos) {
      if (p.id !== photoId && p.is_report_photo) {
        p.is_report_photo = false
        await put(STORE_NAME, p)
      }
    }
  }
  
  photo.is_report_photo = isReportPhoto
  await put(STORE_NAME, photo)
  return photo
}

const remove = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200))
  await deleteById(STORE_NAME, id)
}

const update = async (id: string, data: Partial<SmartPhoto>): Promise<SmartPhoto> => {
  await new Promise((r) => setTimeout(r, 200))
  const photo = await getById<SmartPhoto>(STORE_NAME, id)
  if (!photo) throw new AppError('NOT_FOUND', 'Photo not found')
  
  const updated = { ...photo, ...data }
  await put(STORE_NAME, updated)
  return updated
}

export const mockPhotoService: PhotoService = {
  getBySession,
  getByParticipant,
  upload,
  setReportPhoto,
  update,
  delete: remove,
}

import type { SmartPhoto } from '../types'
import type { PhotoService } from './types'
import { itemsRequest, itemRequest, voidRequest } from './apiEnvelope'
import { uploadMultipart } from './uploadMultipart'
import { API_ROUTES } from '../constants/apiRoutes'

// Photo service — backed by /api/photos (+ /api/photos/upload multipart) (B5).
// Replaces the IndexedDB barrel. Preserves the `photoService` export name and
// the PhotoService signature.

const getBySession = async (sessionId: string): Promise<SmartPhoto[]> => {
  const qs = new URLSearchParams()
  qs.set('session_id', sessionId)
  qs.set('limit', '100')
  return itemsRequest<SmartPhoto>('GET', `${API_ROUTES.PHOTOS.BASE}?${qs.toString()}`)
}

const getByParticipant = async (
  participantId: string,
): Promise<SmartPhoto[]> => {
  const qs = new URLSearchParams()
  qs.set('participant_id', participantId)
  qs.set('limit', '100')
  return itemsRequest<SmartPhoto>('GET', `${API_ROUTES.PHOTOS.BASE}?${qs.toString()}`)
}

const upload = async (
  participantId: string,
  sessionId: string,
  file: File,
): Promise<SmartPhoto> => {
  const form = new FormData()
  form.append('file', file)
  form.append('participant_id', participantId)
  form.append('session_id', sessionId)
  form.append('is_report_photo', 'false')
  return uploadMultipart<SmartPhoto>(API_ROUTES.PHOTOS.UPLOAD, form)
}

const update = async (
  photoId: string,
  data: Partial<SmartPhoto>,
): Promise<SmartPhoto> => {
  const body: Record<string, unknown> = {}
  if (data.framed_file_url !== undefined)
    body.framed_file_url = data.framed_file_url
  if (data.is_report_photo !== undefined)
    body.is_report_photo = data.is_report_photo
  if (data.taken_by !== undefined) body.taken_by = data.taken_by
  if (data.taken_at !== undefined) body.taken_at = data.taken_at
  if (data.frame_id !== undefined) body.frame_id = data.frame_id
  return itemRequest<SmartPhoto>('PUT', API_ROUTES.PHOTOS.DETAIL(photoId), body)
}

const remove = async (id: string): Promise<void> => {
  await voidRequest('DELETE', API_ROUTES.PHOTOS.DETAIL(id))
}

export const photoService: PhotoService = {
  getBySession,
  getByParticipant,
  upload,
  update,
  delete: remove,
}

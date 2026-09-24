import type { ReportPhotoPick, SmartPhoto } from '../types'
import type { PhotoService } from './types'
import { arrayRequest, itemsRequest, itemRequest, voidRequest } from './api-envelope'
import { uploadMultipart } from './upload-multipart'
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
  return uploadMultipart<SmartPhoto>(API_ROUTES.PHOTOS.UPLOAD, form)
}

const update = async (
  photoId: string,
  data: Partial<SmartPhoto>,
): Promise<SmartPhoto> => {
  const body: Record<string, unknown> = {}
  if (data.framed_file_url !== undefined)
    body.framed_file_url = data.framed_file_url
  if (data.taken_by !== undefined) body.taken_by = data.taken_by
  if (data.taken_at !== undefined) body.taken_at = data.taken_at
  if (data.frame_id !== undefined) body.frame_id = data.frame_id
  return itemRequest<SmartPhoto>('PUT', API_ROUTES.PHOTOS.DETAIL(photoId), body)
}

const remove = async (id: string): Promise<void> => {
  await voidRequest('DELETE', API_ROUTES.PHOTOS.DETAIL(id))
}

const setReportPhoto = (photoId: string): Promise<SmartPhoto> =>
  itemRequest<SmartPhoto>('POST', API_ROUTES.PHOTOS.SET_REPORT(photoId))

const getReportPicks = (
  participantId: string,
  sessionId: string,
): Promise<ReportPhotoPick[]> =>
  arrayRequest<ReportPhotoPick>(
    'GET',
    `${API_ROUTES.PHOTOS.REPORT_PICKS}?participant_id=${participantId}&session_id=${sessionId}`,
  )

const setReportPick = (data: {
  participant_id: string
  session_id: string
  program_stage_id: string
  photo_id: string
}): Promise<SmartPhoto> =>
  itemRequest<SmartPhoto>('PUT', API_ROUTES.PHOTOS.REPORT_PICK, data)

const clearReportPick = async (params: {
  participant_id: string
  session_id: string
  program_stage_id: string
}): Promise<void> => {
  await voidRequest(
    'DELETE',
    `${API_ROUTES.PHOTOS.REPORT_PICK}?participant_id=${params.participant_id}` +
    `&session_id=${params.session_id}&program_stage_id=${params.program_stage_id}`,
  )
}

export const photoService: PhotoService = {
  getBySession,
  getByParticipant,
  upload,
  update,
  delete: remove,
  setReportPhoto,
  getReportPicks,
  setReportPick,
  clearReportPick,
}

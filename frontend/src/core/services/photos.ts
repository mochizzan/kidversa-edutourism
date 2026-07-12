import type { SmartPhoto } from '../types'
import type { PhotoService } from './types'
import { apiRequest, getApiBaseUrl, getTokens } from './backendClient'

// Photo service — backed by /api/photos (+ /api/photos/upload multipart) (B5).
// Replaces the IndexedDB barrel. Preserves the `photoService` export name and
// the PhotoService signature.

interface PhotoListEnvelope {
  data: { items: SmartPhoto[] }
  meta?: { page: number; limit: number; total: number }
}

// Multipart upload helper using fetch + Bearer (apiRequest sends JSON only).
async function uploadMultipart(
  path: string,
  form: FormData,
): Promise<SmartPhoto> {
  const token = getTokens().accessToken
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  // Do NOT set Content-Type — the browser sets the multipart boundary.
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    body: form,
    headers,
    credentials: 'include',
  })
  if (!res.ok) {
    let message = `Upload failed with status ${res.status}`
    let code = 'unknown'
    try {
      const data = await res.json()
      if (typeof data?.error === 'string') message = data.error
      if (typeof data?.code === 'string') code = data.code
    } catch {
      // keep defaults
    }
    throw new Error(`${code}: ${message}`)
  }
  const env = (await res.json()) as { data: SmartPhoto }
  return env.data
}

const getBySession = async (sessionId: string): Promise<SmartPhoto[]> => {
  const qs = new URLSearchParams()
  qs.set('session_id', sessionId)
  qs.set('limit', '100')
  const res = await apiRequest<PhotoListEnvelope>(
    'GET',
    `/api/photos?${qs.toString()}`,
  )
  return res.data?.items ?? []
}

const getByParticipant = async (
  participantId: string,
): Promise<SmartPhoto[]> => {
  const qs = new URLSearchParams()
  qs.set('participant_id', participantId)
  qs.set('limit', '100')
  const res = await apiRequest<PhotoListEnvelope>(
    'GET',
    `/api/photos?${qs.toString()}`,
  )
  return res.data?.items ?? []
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
  return uploadMultipart('/api/photos/upload', form)
}

const setReportPhoto = async (
  photoId: string,
  isReportPhoto: boolean,
): Promise<SmartPhoto> => {
  // Backend POST /:id/set-report-photo enforces the exclusive flag server-side.
  const res = await apiRequest<{ data: SmartPhoto }>(
    'POST',
    `/api/photos/${photoId}/set-report-photo`,
    { is_report_photo: isReportPhoto },
  )
  return res.data
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
  const res = await apiRequest<{ data: SmartPhoto }>(
    'PUT',
    `/api/photos/${photoId}`,
    body,
  )
  return res.data
}

const remove = async (id: string): Promise<void> => {
  await apiRequest<void>('DELETE', `/api/photos/${id}`)
}

export const photoService: PhotoService = {
  getBySession,
  getByParticipant,
  upload,
  setReportPhoto,
  update,
  delete: remove,
}

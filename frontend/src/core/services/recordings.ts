import type { Recording } from '../types'
import type { RecordingService } from './types'
import { apiRequest, getApiBaseUrl, getTokens } from './backendClient'

// Recording service — backed by /api/recordings (+ /api/recordings/upload
// multipart) (B6). Replaces the IndexedDB barrel. Preserves the
// `recordingService` export name and the RecordingService signature.

interface RecordingListEnvelope {
  data: { items: Recording[] }
  meta?: { page: number; limit: number; total: number }
}

// Multipart upload helper using fetch + Bearer (apiRequest sends JSON only).
async function uploadMultipart(
  path: string,
  form: FormData,
): Promise<Recording> {
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
  const env = (await res.json()) as { data: Recording }
  return env.data
}

const getBySession = async (sessionId: string): Promise<Recording[]> => {
  const qs = new URLSearchParams()
  qs.set('session_id', sessionId)
  qs.set('limit', '100')
  const res = await apiRequest<RecordingListEnvelope>(
    'GET',
    `/api/recordings?${qs.toString()}`,
  )
  return res.data?.items ?? []
}

const getByParticipant = async (
  participantId: string,
): Promise<Recording[]> => {
  const qs = new URLSearchParams()
  qs.set('participant_id', participantId)
  qs.set('limit', '100')
  const res = await apiRequest<RecordingListEnvelope>(
    'GET',
    `/api/recordings?${qs.toString()}`,
  )
  return res.data?.items ?? []
}

const getById = async (id: string): Promise<Recording | null> => {
  const res = await apiRequest<{ data: Recording }>(
    'GET',
    `/api/recordings/${id}`,
  )
  return res.data ?? null
}

const update = async (
  id: string,
  data: Partial<Recording>,
): Promise<Recording> => {
  const body: Record<string, unknown> = {}
  if (data.file_url !== undefined) body.file_url = data.file_url
  if (data.duration_seconds !== undefined)
    body.duration_seconds = data.duration_seconds
  if (data.file_size_bytes !== undefined)
    body.file_size_bytes = data.file_size_bytes
  if (data.transcript_text !== undefined)
    body.transcript_text = data.transcript_text
  if (data.review_status !== undefined) body.review_status = data.review_status
  if (data.reviewed_by !== undefined) body.reviewed_by = data.reviewed_by
  if (data.reviewed_at !== undefined) body.reviewed_at = data.reviewed_at
  const res = await apiRequest<{ data: Recording }>(
    'PUT',
    `/api/recordings/${id}`,
    body,
  )
  return res.data
}

const upload = async (
  participantId: string,
  sessionStageId: string,
  file: File,
): Promise<Recording> => {
  const form = new FormData()
  form.append('file', file)
  form.append('participant_id', participantId)
  form.append('session_stage_id', sessionStageId)
  return uploadMultipart('/api/recordings/upload', form)
}

const remove = async (id: string): Promise<void> => {
  await apiRequest<void>('DELETE', `/api/recordings/${id}`)
}

export const recordingService: RecordingService = {
  getBySession,
  getByParticipant,
  getById,
  update,
  upload,
  delete: remove,
}

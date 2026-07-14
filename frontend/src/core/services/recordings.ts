import type { Recording } from '../types'
import type { RecordingService } from './types'
import { apiRequest } from './backendClient'
import { withTenantHeader, normalizeTenantId, itemRequest, voidRequest } from './apiEnvelope'
import { uploadMultipart } from './uploadMultipart'
import { parseRawJSON } from '../utils/rawJson'

// Recording service — backed by /api/recordings (+ /api/recordings/upload
// multipart) (B6). Replaces the IndexedDB barrel. Preserves the
// `recordingService` export name and the RecordingService signature.

interface RecordingListEnvelope {
  data: { items: Recording[] }
  meta?: { page: number; limit: number; total: number }
}

// C7: the backend RawJSON column `emotion_tags_json` arrives as a JSON string
// (or a base64 of the JSON bytes). Normalize it back into the typed
// Record<string, unknown> the frontend expects.
function normalizeRecording(raw: Recording): Recording {
  return {
    ...raw,
    emotion_tags_json: parseRawJSON<Record<string, unknown> | undefined>(
      raw.emotion_tags_json,
      raw.emotion_tags_json,
    ),
  }
}

const getBySession = async (sessionId: string): Promise<Recording[]> => {
  const qs = new URLSearchParams()
  qs.set('session_id', sessionId)
  qs.set('limit', '100')
  const res = await apiRequest<RecordingListEnvelope>(
    'GET',
    `/api/recordings?${qs.toString()}`,
    undefined,
    { headers: withTenantHeader() },
  )
  return (res.data?.items ?? []).map((r) => normalizeTenantId(normalizeRecording(r)))
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
    undefined,
    { headers: withTenantHeader() },
  )
  return (res.data?.items ?? []).map((r) => normalizeTenantId(normalizeRecording(r)))
}

const getById = async (id: string): Promise<Recording | null> => {
  const res = await apiRequest<{ data: Recording }>(
    'GET',
    `/api/recordings/${id}`,
    undefined,
    { headers: withTenantHeader() },
  )
  return res.data ? normalizeRecording(res.data) : null
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
  return itemRequest<Recording>('PUT', `/api/recordings/${id}`, body)
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
  return uploadMultipart<Recording>('/api/recordings/upload', form)
}

const remove = async (id: string): Promise<void> => {
  await voidRequest('DELETE', `/api/recordings/${id}`)
}

export const recordingService: RecordingService = {
  getBySession,
  getByParticipant,
  getById,
  update,
  upload,
  delete: remove,
}

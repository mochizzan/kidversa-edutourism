// Shared multipart upload helper (Fase 4 D1). The backend multipart endpoints
// (e.g. /api/photos/upload, /api/recordings/upload) expect a raw multipart
// body; apiRequest sends JSON only, so we use fetch directly with the Bearer
// token. On failure we throw an ApiError (NOT a plain Error) so the shared
// error-handling layer (which checks `instanceof ApiError`) can surface the
// status/code/message consistently.

import { getApiBaseUrl, getTokens, ApiError } from './backendClient'

export async function uploadMultipart<T>(path: string, form: FormData): Promise<T> {
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
    throw new ApiError(message, code, res.status)
  }
  const env = (await res.json()) as { data: T }
  return env.data
}

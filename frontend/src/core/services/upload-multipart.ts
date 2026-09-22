// Shared multipart upload helper (Fase 4 D1). The backend multipart endpoints
// (e.g. /api/photos/upload, /api/frames/upload) expect a raw multipart body;
// apiRequest sends JSON only, so we use XHR directly with the Bearer token.
//
// We use XMLHttpRequest (not fetch) because it is the only browser API that
// exposes upload progress events (fetch does not). The Promise-based API is
// preserved; an optional `onProgress`/`signal` lets callers render progress and
// abort the in-flight upload.
//
// On failure we throw an ApiError (NOT a plain Error) so the shared
// error-handling layer (which checks `instanceof ApiError`) can surface the
// status/code/message consistently.

import {
 getApiBaseUrl,
 getTokens,
 refreshAccessToken,
 fireUnauthorized,
 ApiError,
} from './backend-client'
import { getActiveTenantId } from '../utils/tenant'

export interface UploadMultipartOptions {
 // Called with a 0–100 percentage as the request body uploads.
 onProgress?: (percent: number) => void
 // Optional AbortSignal to cancel the upload.
 signal?: AbortSignal
 // AbortSignal.timeout() may not exist on older targets; if provided we also
 // honor a manual timeout (ms) by aborting the XHR.
 timeoutMs?: number
}

/**
 * Wraps a single multipart POST attempt in a Promise.
 * Returns the parsed response body or throws an ApiError.
 */
function sendMultipart<T>(
 path: string,
 form: FormData,
 token: string | null,
 options: Pick<UploadMultipartOptions, 'onProgress' | 'signal' | 'timeoutMs'>,
): Promise<T> {
 const { onProgress, signal, timeoutMs } = options

 return new Promise<T>((resolve, reject) => {
  const xhr = new XMLHttpRequest()
  xhr.open('POST', `${getApiBaseUrl()}${path}`, true)
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
  // SUPER_ADMIN JWT carries no tenant — inject the active tenant from localStorage
  // so TenantScope middleware resolves correctly. Non-SA roles return null → no
  // header sent (middleware uses JWT tid). Mirrors apiRequest (backend-client.ts:338).
  const tid = getActiveTenantId()
  if (tid) xhr.setRequestHeader('X-Tenant-Id', tid)
  xhr.withCredentials = true

  if (timeoutMs && timeoutMs > 0) {
   xhr.timeout = timeoutMs
  }

  xhr.upload.onprogress = (e: ProgressEvent) => {
   if (!onProgress || !e.lengthComputable) return
   onProgress(Math.round((e.loaded / e.total) * 100))
  }

  xhr.onload = () => {
   let parsed: { data?: T; error?: string | { code?: string; message?: string }; code?: string } = {}
   try {
    parsed = JSON.parse(xhr.responseText)
   } catch {
    // keep defaults
   }
   if (xhr.status >= 200 && xhr.status < 300) {
    resolve((parsed.data ?? parsed) as T)
    return
   }
   // Backend errors use the envelope shape { error: { code, message } };
   // legacy flat shapes ({ error: string, top-level code }) still parse.
   const err = parsed.error
   const envelope = typeof err === 'object' && err !== null ? err : null
   const message =
    envelope?.message ||
    (typeof err === 'string' ? err : `Upload failed with status ${xhr.status}`)
   const code = envelope?.code || (typeof parsed.code === 'string' ? parsed.code : 'unknown')
   reject(new ApiError(message, code, xhr.status))
  }

  xhr.onerror = () => {
   reject(new ApiError('Network error during upload', 'network_error', 0))
  }

  xhr.ontimeout = () => {
   reject(new ApiError('Upload timed out', 'timeout', 0))
  }

  xhr.onabort = () => {
   reject(new DOMException('Upload aborted', 'AbortError'))
  }

  if (signal) {
   if (signal.aborted) {
    xhr.abort()
    return
   }
   signal.addEventListener('abort', () => xhr.abort(), { once: true })
  }

  xhr.send(form)
 })
}

export async function uploadMultipart<T>(
 path: string,
 form: FormData,
 options: UploadMultipartOptions = {},
): Promise<T> {
 let token = getTokens().accessToken

 try {
  return await sendMultipart<T>(path, form, token, options)
 } catch (err) {
  // On 401 — attempt a single token refresh + retry, mirroring apiRequest.
  if (err instanceof ApiError && err.status === 401) {
   try {
    await refreshAccessToken()
    token = getTokens().accessToken
    return await sendMultipart<T>(path, form, token, options)
   } catch {
    fireUnauthorized()
    throw new ApiError('Session expired', 'refresh_failed', 401)
   }
  }
  throw err
 }
}

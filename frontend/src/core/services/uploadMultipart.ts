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

import { getApiBaseUrl, getTokens, ApiError } from './backendClient'

export interface UploadMultipartOptions {
  // Called with a 0–100 percentage as the request body uploads.
  onProgress?: (percent: number) => void
  // Optional AbortSignal to cancel the upload.
  signal?: AbortSignal
  // AbortSignal.timeout() may not exist on older targets; if provided we also
  // honor a manual timeout (ms) by aborting the XHR.
  timeoutMs?: number
}

export async function uploadMultipart<T>(
  path: string,
  form: FormData,
  options: UploadMultipartOptions = {},
): Promise<T> {
  const { onProgress, signal, timeoutMs } = options
  const token = getTokens().accessToken

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${getApiBaseUrl()}${path}`, true)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.withCredentials = true

    if (timeoutMs && timeoutMs > 0) {
      xhr.timeout = timeoutMs
    }

    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (!onProgress || !e.lengthComputable) return
      onProgress(Math.round((e.loaded / e.total) * 100))
    }

    xhr.onload = () => {
      let parsed: { data?: T; error?: string; code?: string } = {}
      try {
        parsed = JSON.parse(xhr.responseText)
      } catch {
        // keep defaults
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((parsed.data ?? parsed) as T)
        return
      }
      const message =
        typeof parsed.error === 'string'
          ? parsed.error
          : `Upload failed with status ${xhr.status}`
      const code = typeof parsed.code === 'string' ? parsed.code : 'unknown'
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

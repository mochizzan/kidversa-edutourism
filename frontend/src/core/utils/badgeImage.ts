// badgeImage.ts — reusable helper for badge image uploads (Fase 5).
//
// There is no dedicated badge-upload endpoint, so we reuse the existing content
// upload route (/api/contents/upload) which persists the file and returns the
// created Content row. The badge image is decorative, so we store the Content's
// id in `badge_image_url` and display it through the authenticated, tenant-
// scoped media endpoint (kind "content"). This mirrors how frames/content
// images are stored (a relative id resolved via getMediaUrl).
//
// D4 contract:
// - The file bytes go over the wire as-is — NO compression, no canvas resize.
// - Caller options (onProgress / signal / timeoutMs) are forwarded to
//   uploadMultipart so the UI can show real transfer progress, cancel, and
//   time out instead of hanging.
// - ONLY transport failures (XHR status 0: network error or timeout) are
//   retried automatically, with exponential backoff mirroring backend-client
//   (1s → 2s → 4s, cap 8s, 3 attempts total). HTTP 4xx/5xx surface
//   immediately — retrying a 5xx could duplicate the Content row.

import { uploadMultipart, type UploadMultipartOptions } from '../services/upload-multipart'
import { ApiError } from '../services/backend-client'
import { API_ROUTES } from '../constants/apiRoutes'
import type { Content } from '../types'

/** Total upload attempts: 1 initial + 2 automatic network retries. */
export const BADGE_UPLOAD_MAX_ATTEMPTS = 3
/** Default XHR timeout so a dead connection fails fast instead of hanging. */
export const BADGE_UPLOAD_TIMEOUT_MS = 30_000
/** Backoff after failed attempt n: 1s → 2s → 4s … capped at 8s. */
const RETRY_BASE_DELAY_MS = 1_000
const RETRY_MAX_DELAY_MS = 8_000

export interface UploadBadgeImageOptions extends UploadMultipartOptions {
 /**
  * Called right before an automatic retry starts. `attempt` is the upcoming
  * attempt number (2..BADGE_UPLOAD_MAX_ATTEMPTS) so the UI can show an
  * honest "retrying n/max" state instead of a fake server status.
  */
 onRetry?: (attempt: number, maxAttempts: number) => void
}

/**
 * Retryable ONLY for transport failures: upload-multipart maps XHR network
 * errors and timeouts to ApiError with status 0. HTTP 4xx/5xx, aborts and
 * malformed-response errors are never retried.
 */
export function isRetryableUploadError(err: unknown): boolean {
 return (
  err instanceof ApiError &&
  err.status === 0 &&
  (err.code === 'network_error' || err.code === 'timeout')
 )
}

function backoffDelay(attempt: number): number {
 // `attempt` = the one that just failed (1-based): 1s, 2s, 4s … cap 8s.
 return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
 const { promise, resolve, reject } = Promise.withResolvers<void>()
 if (signal?.aborted) {
  reject(new DOMException('Upload aborted', 'AbortError'))
  return promise
 }
 const onAbort = () => {
  clearTimeout(timer)
  reject(new DOMException('Upload aborted', 'AbortError'))
 }
 const timer = setTimeout(() => {
  signal?.removeEventListener('abort', onAbort)
  resolve()
 }, ms)
 signal?.addEventListener('abort', onAbort, { once: true })
 return promise
}

/**
 * uploadMultipart already rejects a 2xx body without a `data` envelope, but a
 * `data` object that merely lacks a usable `id` resolves as-is. That would
 * store `undefined` as the badge reference — a silent fake success. Fail
 * loudly with a user-facing error instead. (The HTTP status is not available
 * after uploadMultipart unwraps the envelope, hence 0.)
 */
function requireContentId(content: Content | null | undefined): string {
 if (!content || typeof content.id !== 'string' || content.id.trim() === '') {
  throw new ApiError(
   'Respons server tidak berisi id konten badge — unggahan tidak dapat dikonfirmasi.',
   'unexpected_response',
   0,
  )
 }
 return content.id
}

export async function uploadBadgeImage(
 file: File,
 options: UploadBadgeImageOptions = {},
): Promise<string> {
 const { onRetry, timeoutMs, ...multipartOptions } = options
 const opts: UploadMultipartOptions = {
  ...multipartOptions,
  timeoutMs: timeoutMs ?? BADGE_UPLOAD_TIMEOUT_MS,
 }

 const form = new FormData()
 form.append('file', file)
 form.append('title', file.name || 'badge')
 form.append('file_type', 'IMAGE')

 for (let attempt = 1; ; attempt++) {
  try {
   const content = await uploadMultipart<Content>(API_ROUTES.CONTENTS.UPLOAD, form, opts)
   // Success is declared only after a valid server response with content.id.
   return requireContentId(content)
  } catch (err) {
   if (!isRetryableUploadError(err)) throw err
   if (attempt >= BADGE_UPLOAD_MAX_ATTEMPTS) {
    // Transport failure after the last attempt: clear, user-facing message.
    // Code "network" maps to the localized errors.network text via
    // friendlyError; the original cause stays in the message for logs.
    throw new ApiError(
     `Pengunggahan badge gagal setelah ${BADGE_UPLOAD_MAX_ATTEMPTS} percobaan. ` +
     'Periksa koneksi internet Anda lalu coba lagi. ' +
     `(${err instanceof Error ? err.message : String(err)})`,
     'network',
     0,
    )
   }
   onRetry?.(attempt + 1, BADGE_UPLOAD_MAX_ATTEMPTS)
   await sleep(backoffDelay(attempt), opts.signal)
  }
 }
}

// api.ts — shared API request/page-size and upload-size constants.
export const FETCH_ALL_LIMIT = 100

export const MAX_UPLOAD_SIZE_MB = 25
export const MAX_FRAME_SIZE_MB = 2

export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
export const MAX_FRAME_SIZE_BYTES = MAX_FRAME_SIZE_MB * 1024 * 1024

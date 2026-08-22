// api.ts — shared API request/page-size and upload-size constants.

// Default page size for paginated list endpoints (used when a caller omits
// `limit`, and as the default `pageSize` for useCrudList).
export const PAGE_SIZE = 10

// Backend hard cap on a single page of results (apiEnvelope loops beyond this).
export const FETCH_ALL_LIMIT = 100

export const MAX_UPLOAD_SIZE_MB = 25
export const MAX_FRAME_SIZE_MB = 2

export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
export const MAX_FRAME_SIZE_BYTES = MAX_FRAME_SIZE_MB * 1024 * 1024

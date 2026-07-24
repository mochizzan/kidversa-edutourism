// A stored upload path is a relative path on disk (e.g. "frames/uuid.jpg") as
// persisted by the backend's persistFile(). These are never served as static
// files; they are streamed through the authenticated, tenant-scoped media
// endpoint GET /api/media/:kind/:id, where :id is the owning entity's UUID.
//
// This module centralizes that translation so every display site resolves a
// stored path (or entity reference) into a servable URL consistently.

export type MediaKind = 'photo' | 'recording' | 'frame' | 'content' | 'avatar'

// Resolve an entity-relative media id into a streamable URL.
// Returns a relative path so the request goes through the Vite dev proxy
// (same-origin from the browser's perspective), ensuring the httpOnly
// session cookie is automatically attached.  Absolute URLs bypass the
// proxy and may lose the cookie on cross-origin requests.
export function getMediaUrl(kind: MediaKind, id: string): string {
  return `/api/media/${kind}/${id}`
}

/**
 * @deprecated This function is broken — it extracts a UUID from the filename
 * path and uses it as the entity ID, but persistFile() generates a random UUID
 * for the filename that differs from the entity's DB row ID. Use
 * `getMediaUrl(kind, entity.id)` directly instead.
 */
export function resolveStoredUpload(
  storedPath: string | undefined | null,
  kind: MediaKind,
): string | null {
  if (!storedPath) return null
  // Already a full/absolute URL or data URL — pass through unchanged.
  if (/^(https?:|data:|blob:)/.test(storedPath)) return storedPath
  const base = storedPath.includes('/') ? storedPath.split('/').pop()! : storedPath
  const dot = base.lastIndexOf('.')
  const id = dot > 0 ? base.slice(0, dot) : base
  if (!id) return null
  return getMediaUrl(kind, id)
}

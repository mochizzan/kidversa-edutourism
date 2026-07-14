import { getApiBaseUrl } from '../services/backendClient'

// A stored upload path is a relative path on disk (e.g. "frames/uuid.jpg") as
// persisted by the backend's persistFile(). These are never served as static
// files; they are streamed through the authenticated, tenant-scoped media
// endpoint GET /api/media/:kind/:id, where :id is the owning entity's UUID.
//
// This module centralizes that translation so every display site resolves a
// stored path (or entity reference) into a servable URL consistently.

export type MediaKind = 'photo' | 'recording' | 'frame' | 'content' | 'avatar'

// Resolve an entity-relative media id into a streamable URL.
export function getMediaUrl(kind: MediaKind, id: string): string {
  return `${getApiBaseUrl()}/api/media/${kind}/${id}`
}

// Resolve a stored upload path (frames/uuid.jpg) back to its entity id + kind.
// persistFile names files as "<uuid>.<ext>" inside a subdir; the entity id is
// the uuid portion. If the path doesn't match the expected shape we return null
// so callers can fall back to a local blob/placeholder.
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

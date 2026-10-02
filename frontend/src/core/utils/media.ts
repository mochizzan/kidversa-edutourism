// A stored upload path is a relative path on disk (e.g. "frames/uuid.jpg") as
// persisted by the backend's persistFile(). These are never served as static
// files; they are streamed through the authenticated, tenant-scoped media
// endpoint GET /api/media/:kind/:id, where :id is the owning entity's UUID.
//
// This module centralizes that translation so every display site resolves a
// stored path (or entity reference) into a servable URL consistently.

import { getActiveTenantId } from './tenant'

export type MediaKind = 'photo' | 'frame' | 'content' | 'avatar'

// Resolve an entity-relative media id into a streamable URL.
// Returns a relative path so the request goes through the Vite dev proxy
// (same-origin from the browser's perspective), ensuring the httpOnly
// session cookie is automatically attached.  Absolute URLs bypass the
// proxy and may lose the cookie on cross-origin requests.
//
// <img> requests carry no custom headers, so SUPER_ADMIN (whose JWT has no
// tenant claim) must scope via the ?tenant_id= query fallback honored by the
// TenantScope middleware — same pattern as openSSE.
//
// `version` is the client cache key for bytes that change behind a stable
// entity id (P1-3): pass server data that changes exactly when the stored
// bytes change (e.g. an avatar/content file path re-minted by the mutation —
// never a constant). It is merged with tenant_id into ONE query string; when
// absent the URL is byte-identical to the versionless form.
export function getMediaUrl(kind: MediaKind, id: string, version?: string | null): string {
 const params = new URLSearchParams()
 const tenantId = getActiveTenantId()
 if (tenantId) params.set('tenant_id', tenantId)
 if (version) params.set('v', version)
 const query = params.toString()
 return `/api/media/${kind}/${id}${query ? `?${query}` : ''}`
}

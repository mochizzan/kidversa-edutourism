import type { GalleryData } from '../types'
import { itemRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

const getByToken = async (token: string): Promise<GalleryData | null> => {
 const res = await itemRequest<GalleryData>(
  'GET',
  `${API_ROUTES.REPORTS.GALLERY}?token=${encodeURIComponent(token)}`,
 )
 return res ?? null
}

/**
 * URL of one gallery photo's raw bytes for an <img src>, served by the public
 * GET /api/reports/gallery/photo/:photoId endpoint (under /api/, so it is
 * nginx-proxied to the backend). The gallery token IS the credential — every
 * image request carries it as ?token=.
 *
 * `variant=framed` prefers the framed file and falls back to the original
 * server-side (the grid's visual preference); omitting the variant serves the
 * original file (the fullscreen overlay).
 *
 * `version` (P1-3) is the ?v= cache key: pass the stored path whose re-mint
 * changes exactly when the served bytes change (e.g. framed_file_url for the
 * framed variant — the framing job writes that column behind the SAME photo
 * id, so the original-to-framed transition must not serve a stale cache
 * entry). Absent → no ?v= param.
 */
const photoUrl = (token: string, photoId: string, variant?: 'framed' | 'original', version?: string): string => {
 const base = `${API_ROUTES.REPORTS.GALLERY_PHOTO(photoId)}?token=${encodeURIComponent(token)}`
 const withVariant = variant ? `${base}&variant=${variant}` : base
 return version ? `${withVariant}&v=${encodeURIComponent(version)}` : withVariant
}

export const galleryService = { getByToken, photoUrl }

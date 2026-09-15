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

export const galleryService = { getByToken }

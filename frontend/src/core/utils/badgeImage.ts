// badgeImage.ts — reusable helper for badge image uploads (Fase 5).
//
// There is no dedicated badge-upload endpoint, so we reuse the existing content
// upload route (/api/contents/upload) which persists the file and returns the
// created Content row. The badge image is decorative, so we store the Content's
// id in `badge_image_url` and display it through the authenticated, tenant-
// scoped media endpoint (kind "content"). This mirrors how frames/content
// images are stored (a relative id resolved via getMediaUrl).

import { uploadMultipart } from '../services/uploadMultipart'
import { API_ROUTES } from '../constants/apiRoutes'
import type { Content } from '../types'

export async function uploadBadgeImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('title', file.name || 'badge')
  form.append('file_type', 'IMAGE')
  const content = await uploadMultipart<Content>(API_ROUTES.CONTENTS.UPLOAD, form)
  return content.id
}

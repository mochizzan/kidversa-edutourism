import type { ContentService } from './types'
import type { Content, ContentUsage } from '../types'
import { listRequest, itemRequest, voidRequest, arrayRequest } from './apiEnvelope'
import { uploadMultipart } from './uploadMultipart'
import { API_ROUTES } from '../constants/apiRoutes'

export const contentService: ContentService = {
  getAll: (params) =>
    listRequest<Content>(API_ROUTES.CONTENTS.BASE, params),

  getById: async (id) => {
    try {
      return await itemRequest<Content>('GET', API_ROUTES.CONTENTS.DETAIL(id))
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        return null
      }
      throw err
    }
  },

  create: (data) =>
    itemRequest<Content>('POST', API_ROUTES.CONTENTS.BASE, {
      title: data.title,
      file_url: data.file_url,
      youtube_url: data.youtube_url,
      file_type: data.file_type,
      duration_seconds: data.duration_seconds,
    }),

  update: (id, data) =>
    itemRequest<Content>('PUT', API_ROUTES.CONTENTS.DETAIL(id), data),

  remove: (id) => voidRequest('DELETE', API_ROUTES.CONTENTS.DETAIL(id)),

  getUsage: (id) =>
    arrayRequest<ContentUsage>('GET', API_ROUTES.CONTENTS.USAGE(id)),

  upload: (data) => {
    const form = new FormData()
    form.append('file', data.file)
    form.append('title', data.title)
    form.append('file_type', data.file_type)
    if (data.duration_seconds !== undefined) {
      form.append('duration_seconds', String(data.duration_seconds))
    }
    if (data.youtube_url !== undefined && data.youtube_url !== '') {
      form.append('youtube_url', data.youtube_url)
    }
    return uploadMultipart<Content>(API_ROUTES.CONTENTS.UPLOAD, form)
  },
}
